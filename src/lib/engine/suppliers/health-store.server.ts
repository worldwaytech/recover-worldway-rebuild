// Persistent supplier health (server-only). Every orchestrated call is appended
// to supplier_health_events; supplier_health_status holds the rolling snapshot
// (last 50 calls) used by Supplier Intelligence + Failover. Never throws.
import { HealthTracker } from "../health";
import { bookingBlockers } from "../capabilities";
import type { AdapterOutcome } from "../orchestrator";
import type { SupplierCapability } from "../types";
import { registrationFor } from "./catalog.server";

type EventRow = { supplier_key: string; outcome: string; latency_ms: number; detail: string | null; created_at: string };

/** Pure: rebuild a snapshot from stored events (oldest→newest). */
export function snapshotFromEvents(key: string, rows: EventRow[], prior: number) {
  const t = new HealthTracker();
  for (const r of rows)
    t.record({ supplierKey: key, status: r.outcome as AdapterOutcome["status"], ms: r.latency_ms, count: 0, detail: r.detail ?? undefined }, r.created_at);
  return { snapshot: t.snapshot(key), reliability: t.reliability(key, prior) };
}

export async function persistOutcomes(capability: SupplierCapability, outcomes: AdapterOutcome[]): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const tracked = outcomes.filter((o) => o.status !== "skipped");
    if (!tracked.length) return;
    await db.from("supplier_health_events").insert(
      tracked.map((o) => ({
        supplier_key: o.supplierKey, capability, outcome: o.status,
        latency_ms: Math.round(o.ms), result_count: o.count, detail: o.detail?.slice(0, 500) ?? null,
      })),
    );
    for (const key of new Set(tracked.map((o) => o.supplierKey))) {
      const { data } = await db.from("supplier_health_events")
        .select("supplier_key, outcome, latency_ms, detail, created_at")
        .eq("supplier_key", key).order("created_at", { ascending: false }).limit(50);
      const reg = registrationFor(key);
      const { snapshot, reliability } = snapshotFromEvents(key, ((data ?? []) as EventRow[]).reverse(), reg.reliability);
      await db.from("supplier_health_status").upsert({
        supplier_key: key, status: snapshot.status, readiness: reg.readiness,
        booking_eligible: bookingBlockers(reg).length === 0,
        calls: snapshot.calls, failures: snapshot.failures, error_rate: snapshot.errorRate,
        p50_ms: snapshot.p50Ms, reliability, last_error: snapshot.lastError ?? null,
        last_checked_at: snapshot.lastAt ?? null, updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("[supplier-health] persist failed", e instanceof Error ? e.message : e);
  }
}
