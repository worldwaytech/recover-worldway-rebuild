// TTC catalogue ingestion — SERVER ONLY.
//
// Resumable, idempotent import of approved TTC website content:
// discover (Firecrawl map) -> batch extract -> normalise -> upsert by
// (brand, tour_slug) with content-hash change detection. Every run is logged in
// ttc_sync_runs for admin monitoring.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TTC_BRANDS, TTC_BRAND_ORDER, TTC_CONTENT, type TtcBrand } from "./config";
import {
  firecrawlBatchStart,
  firecrawlBatchWait,
  firecrawlConfigured,
  firecrawlMap,
  firecrawlScrape,
} from "./firecrawl.server";
import {
  TTC_EXTRACTION_PROMPT,
  TTC_EXTRACTION_SCHEMA,
  buildTtcTourRow,
  dedupeTtcUrls,
  type TtcSourceUrl,
  type TtcTourRow,
} from "./extract";
import type { TtcSyncOutcome, TtcSyncRunRow } from "./types";

function adminDb(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Backend service credentials are not available.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ------------------------------------------------------------------ discovery

export async function discoverTtcTourUrls(brand: TtcBrand): Promise<TtcSourceUrl[]> {
  if (!firecrawlConfigured()) {
    throw new Error("Firecrawl is not connected, so TTC content discovery cannot run.");
  }
  const config = TTC_BRANDS[brand];
  const collected: string[] = [];
  for (const search of ["tours", ""]) {
    try {
      const links = await firecrawlMap(config.site, {
        limit: TTC_CONTENT.mapLimit,
        ...(search ? { search } : {}),
      });
      collected.push(...links);
      if (collected.length > 0 && search === "tours") break;
    } catch {
      // Fall through to the next discovery attempt.
    }
  }
  return dedupeTtcUrls(brand, collected);
}

// ------------------------------------------------------------------ extraction

const EXTRACTION_FORMATS = [
  "markdown",
  { type: "json", schema: TTC_EXTRACTION_SCHEMA, prompt: TTC_EXTRACTION_PROMPT },
];

async function extractBatch(sources: TtcSourceUrl[]): Promise<Map<string, TtcTourRow>> {
  const jobId = await firecrawlBatchStart(
    sources.map((source) => source.url),
    EXTRACTION_FORMATS,
    { onlyMainContent: false, waitFor: 2500, maxAge: 0 },
  );
  const documents = await firecrawlBatchWait(jobId);
  const bySource = new Map(sources.map((source) => [source.url, source]));
  const rows = new Map<string, TtcTourRow>();

  for (const document of documents) {
    const sourceUrl = document.metadata?.sourceURL;
    const source =
      (sourceUrl ? bySource.get(sourceUrl.replace(/\/$/, "")) : undefined) ??
      (sourceUrl
        ? [...bySource.values()].find((candidate) => sourceUrl.startsWith(candidate.url))
        : undefined);
    if (!source) continue;
    const row = buildTtcTourRow({
      source,
      extracted: document.json,
      metadata: document.metadata,
      documentLinks: document.links,
    });
    if (row) rows.set(source.url, row);
  }
  return rows;
}

/** Single-page fallback used to retry URLs a batch job could not deliver. */
async function extractOne(source: TtcSourceUrl): Promise<TtcTourRow | null> {
  const document = await firecrawlScrape(source.url, EXTRACTION_FORMATS, {
    onlyMainContent: false,
    waitFor: 2500,
  });
  return buildTtcTourRow({
    source,
    extracted: document.json,
    metadata: document.metadata,
    documentLinks: document.links,
  });
}

// --------------------------------------------------------------------- upsert

async function persistRows(db: SupabaseClient, rows: TtcTourRow[]) {
  let imported = 0;
  let updated = 0;
  let unchanged = 0;
  const failures: { url: string; reason: string }[] = [];
  if (rows.length === 0) return { imported, updated, unchanged, failures };

  const { data: existing, error } = await db
    .from("ttc_tours")
    .select("brand, tour_slug, content_hash")
    .in(
      "tour_slug",
      rows.map((row) => row.tour_slug),
    );
  if (error) throw new Error(`Could not read existing TTC tours: ${error.message}`);

  const known = new Map(
    (existing ?? []).map((row) => [`${row.brand}::${row.tour_slug}`, row.content_hash]),
  );

  const toWrite: TtcTourRow[] = [];
  for (const row of rows) {
    const key = `${row.brand}::${row.tour_slug}`;
    if (!known.has(key)) {
      toWrite.push(row);
      imported += 1;
    } else if (known.get(key) !== row.content_hash) {
      toWrite.push(row);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  if (toWrite.length > 0) {
    const { error: writeError } = await db
      .from("ttc_tours")
      .upsert(toWrite as never, { onConflict: "brand,tour_slug" });
    if (writeError) {
      for (const row of toWrite) failures.push({ url: row.source_url, reason: writeError.message });
      return { imported: 0, updated: 0, unchanged, failures };
    }
  }
  return { imported, updated, unchanged, failures };
}

// ------------------------------------------------------------------- sync run

export interface TtcImportOptions {
  brand: TtcBrand;
  /** Maximum tours processed in this run (bounded work; resume with the cursor). */
  limit?: number;
  /** Resume point: only slugs sorted after this cursor are processed. */
  cursor?: string | null;
  /** Re-extract tours already stored (default: skip stored slugs). */
  refresh?: boolean;
  batchSize?: number;
  /** Concurrent extraction batches in flight. */
  concurrency?: number;
  onProgress?: (progress: { processed: number; total: number; cursor: string }) => void;
}

export async function importTtcBrand(options: TtcImportOptions): Promise<TtcSyncOutcome> {
  const db = adminDb();
  const startedAt = new Date().toISOString();
  const brand = options.brand;
  const batchSize = options.batchSize ?? TTC_CONTENT.batchSize;

  const { data: run } = await db
    .from("ttc_sync_runs")
    .insert({ brand, source: "website", resource: "tours", status: "running" } as never)
    .select("id")
    .single();
  const runId = (run as { id?: string } | null)?.id ?? null;

  const totals = { discovered: 0, imported: 0, updated: 0, unchanged: 0, failed: 0 };
  const failures: { url: string; reason: string }[] = [];
  let cursor: string | null = options.cursor ?? null;
  let status: TtcSyncOutcome["status"] = "completed";
  let errorText: string | null = null;

  try {
    const discovered = await discoverTtcTourUrls(brand);
    totals.discovered = discovered.length;

    let pending = discovered;
    if (cursor) pending = pending.filter((source) => source.slug > cursor!);

    if (!options.refresh) {
      const { data: stored } = await db.from("ttc_tours").select("tour_slug").eq("brand", brand);
      const storedSlugs = new Set((stored ?? []).map((row) => row.tour_slug));
      pending = pending.filter((source) => !storedSlugs.has(source.slug));
    }

    const budget = options.limit ?? pending.length;
    pending = pending.slice(0, budget);

    const batches: TtcSourceUrl[][] = [];
    for (let index = 0; index < pending.length; index += batchSize) {
      batches.push(pending.slice(index, index + batchSize));
    }

    const concurrency = Math.max(1, options.concurrency ?? TTC_CONTENT.concurrency);
    let nextBatch = 0;
    let processed = 0;

    async function worker() {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch++];
        if (!batch) return;
        try {
          const rows = await extractBatch(batch);
          for (const source of batch) {
            if (!rows.has(source.url)) {
              totals.failed += 1;
              failures.push({ url: source.url, reason: "No publishable content extracted" });
            }
          }
          const result = await persistRows(db, [...rows.values()]);
          totals.imported += result.imported;
          totals.updated += result.updated;
          totals.unchanged += result.unchanged;
          totals.failed += result.failures.length;
          failures.push(...result.failures);
        } catch (error) {
          totals.failed += batch.length;
          const reason = error instanceof Error ? error.message : "Extraction failed";
          for (const source of batch) failures.push({ url: source.url, reason });
          status = "partial";
        }

        const last = batch[batch.length - 1];
        if (last && (cursor === null || last.slug > cursor)) cursor = last.slug;
        processed += batch.length;

        if (runId) {
          await db
            .from("ttc_sync_runs")
            .update({
              discovered: totals.discovered,
              imported: totals.imported,
              updated: totals.updated,
              unchanged: totals.unchanged,
              failed: totals.failed,
              cursor,
              status,
            } as never)
            .eq("id", runId);
        }
        options.onProgress?.({
          processed: Math.min(processed, pending.length),
          total: pending.length,
          cursor: cursor ?? "",
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));

    // Retry pass: any URL a batch job could not deliver is re-extracted one by one.
    const bySlug = new Map(pending.map((source) => [source.url, source]));
    let retryTargets = [...new Set(failures.map((failure) => failure.url))]
      .map((url) => bySlug.get(url))
      .filter((source): source is TtcSourceUrl => Boolean(source));

    for (let pass = 0; pass < 2 && retryTargets.length > 0; pass += 1) {
      const stillFailing: TtcSourceUrl[] = [];
      let index = 0;
      async function retryWorker() {
        while (index < retryTargets.length) {
          const source = retryTargets[index++];
          if (!source) return;
          try {
            const row = await extractOne(source);
            if (!row) {
              stillFailing.push(source);
              continue;
            }
            const result = await persistRows(db, [row]);
            totals.imported += result.imported;
            totals.updated += result.updated;
            totals.unchanged += result.unchanged;
            if (result.failures.length > 0) stillFailing.push(source);
            else totals.failed = Math.max(totals.failed - 1, 0);
          } catch {
            stillFailing.push(source);
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(concurrency, retryTargets.length) }, () => retryWorker()),
      );
      retryTargets = stillFailing;
      options.onProgress?.({
        processed: pending.length,
        total: pending.length,
        cursor: `retry pass ${pass + 1}: ${retryTargets.length} still failing`,
      });
    }

    const unresolved = new Set(retryTargets.map((source) => source.url));
    for (let i = failures.length - 1; i >= 0; i -= 1) {
      const failure = failures[i];
      if (failure && !unresolved.has(failure.url)) failures.splice(i, 1);
    }
    totals.failed = unresolved.size;
    status = unresolved.size > 0 ? "partial" : status === "failed" ? status : "completed";
  } catch (error) {
    status = "failed";
    errorText = error instanceof Error ? error.message : "TTC import failed";
  }

  const finishedAt = new Date().toISOString();
  if (runId) {
    await db
      .from("ttc_sync_runs")
      .update({
        status,
        finished_at: finishedAt,
        discovered: totals.discovered,
        imported: totals.imported,
        updated: totals.updated,
        unchanged: totals.unchanged,
        failed: totals.failed,
        cursor,
        error: errorText,
        detail: { failures: failures.slice(0, 50) },
      } as never)
      .eq("id", runId);
  }

  return {
    runId,
    brand,
    source: "website",
    status,
    ...totals,
    cursor,
    error: errorText,
    failures: failures.slice(0, 50),
    startedAt,
    finishedAt,
  };
}

export async function importAllTtcBrands(
  options: { brands?: TtcBrand[]; limitPerBrand?: number; refresh?: boolean } = {},
): Promise<TtcSyncOutcome[]> {
  const brands = options.brands ?? TTC_BRAND_ORDER;
  const results: TtcSyncOutcome[] = [];
  for (const brand of brands) {
    results.push(
      await importTtcBrand({
        brand,
        ...(options.limitPerBrand !== undefined ? { limit: options.limitPerBrand } : {}),
        ...(options.refresh !== undefined ? { refresh: options.refresh } : {}),
      }),
    );
  }
  return results;
}

export async function ttcCatalogueStats() {
  const db = adminDb();
  const [{ count: total }, brands, runs] = await Promise.all([
    db.from("ttc_tours").select("id", { count: "exact", head: true }),
    db.from("ttc_tours").select("brand, brand_label, price_from, duration_days, source_scraped_at"),
    db.from("ttc_sync_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);

  const byBrand = new Map<string, { brand: string; label: string; count: number; withPrice: number }>();
  for (const row of brands.data ?? []) {
    const key = row.brand as string;
    const entry = byBrand.get(key) ?? {
      brand: key,
      label: (row.brand_label as string) ?? key,
      count: 0,
      withPrice: 0,
    };
    entry.count += 1;
    if (row.price_from !== null) entry.withPrice += 1;
    byBrand.set(key, entry);
  }

  return {
    total: total ?? 0,
    brands: [...byBrand.values()].sort((a, b) => b.count - a.count),
    runs: (runs.data ?? []).map((run) => {
      const row = run as Record<string, unknown>;
      return {
        id: String(row["id"]),
        brand: String(row["brand"]),
        source: String(row["source"]),
        resource: String(row["resource"]),
        status: String(row["status"]),
        started_at: String(row["started_at"]),
        finished_at: (row["finished_at"] as string | null) ?? null,
        discovered: Number(row["discovered"] ?? 0),
        imported: Number(row["imported"] ?? 0),
        updated: Number(row["updated"] ?? 0),
        unchanged: Number(row["unchanged"] ?? 0),
        failed: Number(row["failed"] ?? 0),
        cursor: (row["cursor"] as string | null) ?? null,
        error: (row["error"] as string | null) ?? null,
      } satisfies TtcSyncRunRow;
    }),
  };
}
