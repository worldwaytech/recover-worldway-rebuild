// TravelShop catalogue sync — resumable, paginated, no page cap.
// A run advances page by page and persists its cursor, so it can continue
// across invocations (Worker time limits) until the last page is reached.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRAVELSHOP_PATHS, travelshopRequest, requestStats, resetRequestStats } from "./client.server";
import { normalizeTour } from "./normalize";

type Db = SupabaseClient;
interface SearchPage {
  total: number;
  lastPage: number;
  perPage: number;
  tours: Record<string, unknown>[];
}

export async function startRun(db: Db, trigger: string, scope: "full" | "incremental" = "full") {
  const { data: running } = await db.from("travelshop_sync_runs").select("id").eq("status", "running").maybeSingle();
  if (running) return running.id as string;
  const { data, error } = await db.from("travelshop_sync_runs").insert({ trigger, scope, status: "running" }).select("id").single();
  if (error) throw new Error(`Could not start sync run: ${error.message}`);
  return data.id as string;
}

async function logFailure(db: Db, runId: string, f: { page?: number; external_id?: number | null; slug?: string | null; kind: string; error: string; attempts?: number }) {
  await db.from("travelshop_sync_failures").insert({ run_id: runId, ...f });
}

/** Process pages until done or the deadline passes. Returns the run row. */
export async function continueRun(db: Db, runId: string, deadlineMs: number) {
  resetRequestStats();
  const { data: run, error } = await db.from("travelshop_sync_runs").select("*").eq("id", runId).single();
  if (error || !run) throw new Error("Sync run not found");
  if (run.status !== "running") return run;
  let page: number = run.next_page;
  const c = {
    pages_done: run.pages_done as number, fetched: run.fetched as number, created: run.created as number,
    updated: run.updated as number, unchanged: run.unchanged as number, skipped: run.skipped as number,
    failed: run.failed as number, duplicates: run.duplicates as number,
  };
  let lastPage: number | null = run.pages_total;
  let total: number | null = run.total_reported;
  let lastError: string | null = run.last_error;

  while (Date.now() < deadlineMs && (lastPage === null || page <= lastPage)) {
    let body: SearchPage;
    try {
      body = await travelshopRequest<SearchPage>(TRAVELSHOP_PATHS.search, { method: "POST", body: { page } });
    } catch (e) {
      lastError = `page ${page}: ${e instanceof Error ? e.message : "error"}`;
      await logFailure(db, runId, { page, kind: "page", error: lastError, attempts: 5 });
      c.failed++;
      page++;
      c.pages_done++;
      continue;
    }
    total = body.total;
    lastPage = body.lastPage;
    const rows = [];
    const seen = new Set<number>();
    for (const raw of body.tours ?? []) {
      c.fetched++;
      const n = normalizeTour(raw);
      if (!n.ok) {
        c.skipped++;
        await logFailure(db, runId, { page, external_id: n.externalId, slug: n.slug, kind: "record", error: n.reason });
        continue;
      }
      if (seen.has(n.tour.external_id)) { c.duplicates++; continue; }
      seen.add(n.tour.external_id);
      rows.push(n.tour);
    }
    if (rows.length) {
      const { data: existing } = await db
        .from("travelshop_tours")
        .select("external_id, content_hash, last_seen_run")
        .in("external_id", rows.map((r) => r.external_id));
      const prev = new Map((existing ?? []).map((e) => [Number(e.external_id), e]));
      const now = new Date().toISOString();
      const upserts = [];
      for (const r of rows) {
        const p = prev.get(r.external_id);
        if (p && p.last_seen_run === runId) { c.duplicates++; continue; } // already seen on an earlier page this run
        if (!p) c.created++;
        else if (p.content_hash !== r.content_hash) c.updated++;
        else c.unchanged++;
        upserts.push({ ...r, last_synced_at: now, last_seen_run: runId });
      }
      if (upserts.length) {
        const { error: upErr } = await db.from("travelshop_tours").upsert(upserts, { onConflict: "external_id" });
        if (upErr) {
          // Fall back to row-by-row so one bad record (e.g. slug clash) doesn't drop the page.
          for (const u of upserts) {
            const { error: e1 } = await db.from("travelshop_tours").upsert(u, { onConflict: "external_id" });
            if (e1) {
              c.failed++;
              const p = prev.get(u.external_id);
              if (!p) c.created--; else if (p.content_hash !== u.content_hash) c.updated--; else c.unchanged--;
              await logFailure(db, runId, { page, external_id: u.external_id, slug: u.slug, kind: "record", error: e1.message });
            }
          }
        }
      }
    }
    c.pages_done++;
    page++;
    const stats = requestStats();
    await db.from("travelshop_sync_runs").update({
      ...c, next_page: page, pages_total: lastPage, total_reported: total, last_error: lastError,
      request_count: (run.request_count as number) + stats.requestCount,
      retry_count: (run.retry_count as number) + stats.retryCount,
    }).eq("id", runId);
  }

  const done = lastPage !== null && page > lastPage;
  if (done) {
    let deactivated = 0;
    const pageFailures = await db.from("travelshop_sync_failures").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("kind", "page");
    // Only retire tours missing from the feed when every page was read.
    if ((pageFailures.count ?? 0) === 0) {
      const { data: gone } = await db.from("travelshop_tours").update({ is_active: false }).neq("last_seen_run", runId).eq("is_active", true).select("id");
      deactivated = gone?.length ?? 0;
    }
    await db.from("travelshop_sync_runs").update({
      status: (pageFailures.count ?? 0) > 0 ? "completed_with_errors" : "completed",
      finished_at: new Date().toISOString(), deactivated,
    }).eq("id", runId);
  }
  const { data: out } = await db.from("travelshop_sync_runs").select("*").eq("id", runId).single();
  return out;
}

export async function syncOverview(db: Db) {
  const [runs, active, all, failures, lastOk] = await Promise.all([
    db.from("travelshop_sync_runs").select("*").order("started_at", { ascending: false }).limit(10),
    db.from("travelshop_tours").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("travelshop_tours").select("id", { count: "exact", head: true }),
    db.from("travelshop_sync_failures").select("*").order("created_at", { ascending: false }).limit(25),
    db.from("travelshop_sync_runs").select("finished_at").in("status", ["completed", "completed_with_errors"]).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    runs: runs.data ?? [],
    activeTours: active.count ?? 0,
    storedTours: all.count ?? 0,
    failures: failures.data ?? [],
    lastSuccessfulSync: (lastOk.data?.finished_at as string | undefined) ?? null,
  };
}
