import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Journey } from "@/lib/data";

async function assertStaff(context: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error) throw new Error("Your permissions could not be verified.");
  if (!data) throw new Error("Forbidden");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const COUNT_KEYS = ["discovered", "created", "updated", "unchanged", "deactivated", "failed"] as const;
type Counts = Record<(typeof COUNT_KEYS)[number], number>;

// ------------------------------------------------------------------- AKTG

export const runAktgSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const db = await admin();
    const { data: session, error } = await db
      .from("catalogue_sync_sessions")
      .insert({ provider: "aktg", triggered_by: context.userId } as never)
      .select("id")
      .single();
    if (error || !session) throw new Error("Could not start the AKTG sync.");
    const id = (session as { id: string }).id;
    try {
      const { runAktgFullSync } = await import("./aktg-sync.server");
      const counts = await runAktgFullSync(db as never, id);
      const status = counts.failed > 0 ? "partial" : "completed";
      await db
        .from("catalogue_sync_sessions")
        .update({ status, finished_at: new Date().toISOString() } as never)
        .eq("id", id);
      return { id, status, ...counts };
    } catch (e) {
      const message = e instanceof Error ? e.message : "AKTG sync failed";
      await db
        .from("catalogue_sync_sessions")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() } as never)
        .eq("id", id);
      throw new Error(message);
    }
  });

// -------------------------------------------------------------------- TTC

export const startTtcSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const db = await admin();
    const { TTC_BRAND_ORDER } = await import("@/lib/ttc/config");
    const { data, error } = await db
      .from("catalogue_sync_sessions")
      .insert({ provider: "ttc", triggered_by: context.userId, detail: { brands: TTC_BRAND_ORDER } } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not start the TTC sync.");
    return { id: (data as { id: string }).id, brands: [...TTC_BRAND_ORDER] as string[] };
  });

export const stepTtcSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; brand: string; cursor?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const [{ ttcFullSyncStep }, { isTtcBrand }] = await Promise.all([
      import("@/lib/ttc/ingest.server"),
      import("@/lib/ttc/config"),
    ]);
    if (!isTtcBrand(data.brand)) throw new Error("Unknown TTC brand.");
    const chunk = await ttcFullSyncStep({ brand: data.brand, cursor: data.cursor ?? null, limit: 16 });
    const db = await admin();
    const { data: row } = await db
      .from("catalogue_sync_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .single();
    if (row) {
      const current = row as unknown as Counts & { detail: Record<string, unknown> };
      const perBrand = ((current.detail?.["perBrand"] as Record<string, number>) ?? {}) as Record<string, number>;
      // "discovered" counts each brand once (its full discovered total).
      const discovered =
        current.discovered - (perBrand[data.brand] ?? 0) + chunk.discovered;
      perBrand[data.brand] = chunk.discovered;
      const errors = ((current.detail?.["errors"] as string[]) ?? []).slice(0, 40);
      if (chunk.error) errors.push(`${data.brand}: ${chunk.error}`);
      await db
        .from("catalogue_sync_sessions")
        .update({
          discovered,
          created: current.created + chunk.created,
          updated: current.updated + chunk.updated,
          unchanged: current.unchanged + chunk.unchanged,
          deactivated: current.deactivated + chunk.deactivated,
          failed: current.failed + chunk.failed + (chunk.error ? 1 : 0),
          detail: { ...current.detail, perBrand, errors },
        } as never)
        .eq("id", data.sessionId);
    }
    return chunk;
  });

export const finishTtcSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; cancelled?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const db = await admin();
    const { data: row } = await db
      .from("catalogue_sync_sessions")
      .select("failed")
      .eq("id", data.sessionId)
      .single();
    const failed = (row as { failed?: number } | null)?.failed ?? 0;
    const status = data.cancelled ? "cancelled" : failed > 0 ? "partial" : "completed";
    await db
      .from("catalogue_sync_sessions")
      .update({ status, finished_at: new Date().toISOString() } as never)
      .eq("id", data.sessionId);
    return { status };
  });

// --------------------------------------------------------------- overview

export const getCatalogueSyncOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const db = await admin();
    const [sessions, akActive, akInactive, ttcActive, ttcInactive] = await Promise.all([
      db.from("catalogue_sync_sessions").select("*").order("started_at", { ascending: false }).limit(40),
      db.from("aktg_journeys").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("aktg_journeys").select("id", { count: "exact", head: true }).eq("is_active", false),
      db.from("ttc_tours").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("ttc_tours").select("id", { count: "exact", head: true }).eq("is_active", false),
    ]);
    const rows = (sessions.data ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: String(x["id"]),
        provider: String(x["provider"]),
        status: String(x["status"]),
        discovered: Number(x["discovered"]),
        created: Number(x["created"]),
        updated: Number(x["updated"]),
        unchanged: Number(x["unchanged"]),
        deactivated: Number(x["deactivated"]),
        failed: Number(x["failed"]),
        error: (x["error"] as string | null) ?? null,
        startedAt: String(x["started_at"]),
        finishedAt: (x["finished_at"] as string | null) ?? null,
      };
    });
    return {
      sessions: rows,
      totals: {
        aktg: { active: akActive.count ?? 0, inactive: akInactive.count ?? 0 },
        ttc: { active: ttcActive.count ?? 0, inactive: ttcInactive.count ?? 0 },
      },
    };
  });

// ----------------------------------------------------- public journey reads

type Overrides = Partial<Journey>;

export const getSyncedJourneyCards = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = publicClient();
    const { data, error } = await db
      .from("aktg_journeys")
      .select("slug, is_active, card, worldway_overrides")
      .limit(5000);
    if (error) return { cards: [] as Journey[], inactive: [] as string[] };
    const cards: Journey[] = [];
    const inactive: string[] = [];
    for (const row of data ?? []) {
      if (!row.is_active) inactive.push(row.slug as string);
      else cards.push({ ...(row.card as Journey), ...((row.worldway_overrides as Overrides) ?? {}) });
    }
    return { cards, inactive };
  } catch {
    return { cards: [] as Journey[], inactive: [] as string[] };
  }
});

export const getSyncedJourney = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: String(input.slug).slice(0, 200) }))
  .handler(async ({ data }) => {
    try {
      const db = publicClient();
      const { data: row } = await db
        .from("aktg_journeys")
        .select("is_active, data, worldway_overrides")
        .eq("slug", data.slug)
        .maybeSingle();
      if (!row) return null;
      return {
        active: Boolean(row.is_active),
        journey: { ...(row.data as Journey), ...((row.worldway_overrides as Overrides) ?? {}) },
      };
    } catch {
      return null;
    }
  });
