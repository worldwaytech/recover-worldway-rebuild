// Admin: trip intelligence decisions, stale-price queue, learning outcomes,
// contracted inventory and recheck runs. Staff-gated; writes are audited.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string; claims?: { email?: string }; supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } };
async function assertStaff(c: Ctx) {
  const { data, error } = await c.supabase.rpc("is_staff", { _user_id: c.userId });
  if (error || data !== true) throw new Error("Forbidden");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function db(): Promise<any> { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function audit(c: Ctx, action: string, detail: Record<string, unknown>) {
  await (await db()).from("admin_audit_log").insert({ actor_id: c.userId, actor_email: c.claims?.email ?? null, action, target_table: "intelligence", detail });
}

export const getIntelligenceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx; await assertStaff(c);
    const sb = await db();
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [dec, out, inv, runs, tb, vers, sims] = await Promise.all([
      sb.from("intel_decisions").select("id, journey_id, label, score, total, currency, min_confidence, bookable, risks, channels, recheck_due, recheck_status, last_rechecked_at, created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("intel_outcomes").select("supplier_key, kind, event").gte("created_at", since).limit(20000),
      sb.from("contracted_inventory").select("*").order("updated_at", { ascending: false }).limit(200),
      sb.from("intel_recheck_runs").select("*").order("started_at", { ascending: false }).limit(20),
      sb.from("travel_bookings").select("product, status").gte("created_at", since).limit(5000),
      sb.from("journey_versions").select("journey_id, version, created_at").order("created_at", { ascending: false }).limit(50),
      sb.from("journey_simulations").select("journey_id, status, price_delta, requires_approval, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    const { learnFromOutcomes } = await import("@/lib/engine/intelligence/commerce");
    const learning = learnFromOutcomes((out.data ?? []).map((r: any) => ({ supplierKey: r.supplier_key, kind: r.kind, event: r.event })));
    const { supplierRegistry, liveStatus } = await import("@/lib/engine/suppliers/catalog.server");
    const partners = [...supplierRegistry().values()].map((r) => ({ key: r.supplierKey, kinds: r.kinds, status: liveStatus(r), reliability: r.reliability, learned: learning.find((l) => l.supplierKey === r.supplierKey) ?? null }));
    const bookings: Record<string, Record<string, number>> = {};
    for (const b of tb.data ?? []) { (bookings[b.product] ??= {})[b.status] = ((bookings[b.product] ?? {})[b.status] ?? 0) + 1; }
    const decisions = dec.data ?? [];
    return {
      decisions, stale: decisions.filter((d: any) => Array.isArray(d.recheck_due) && d.recheck_due.length),
      partners, bookings, contracted: inv.data ?? [], runs: runs.data ?? [], versions: vers.data ?? [], changes: sims.data ?? [],
    };
  });

const Inv = z.object({
  id: z.string().uuid().optional(),
  supplierKey: z.string().trim().min(2).max(60), kind: z.enum(["stay", "activity", "transfer", "flight", "cruise", "rail", "insurance"]),
  externalId: z.string().trim().min(1).max(200), title: z.string().trim().min(2).max(200), place: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(3).max(60), validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  netAmount: z.number().nonnegative().max(1e9), currency: z.string().length(3).toUpperCase(), refundable: z.boolean(), quality: z.number().min(0).max(5).nullable(), active: z.boolean(),
});

export const saveContractedInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Inv.parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx; await assertStaff(c);
    if (data.validTo < data.validFrom) throw new Error("End date is before start date");
    try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }); } catch { throw new Error("Unknown timezone"); }
    const row = { supplier_key: data.supplierKey, kind: data.kind, external_id: data.externalId, title: data.title, place: data.place, timezone: data.timezone, valid_from: data.validFrom, valid_to: data.validTo, net_amount: data.netAmount, currency: data.currency, refundable: data.refundable, quality: data.quality, active: data.active, updated_by: c.userId, last_verified_at: null, verification_note: "Edited — needs a live check" };
    const sb = await db();
    const res = data.id ? await sb.from("contracted_inventory").update(row).eq("id", data.id).select("id").single() : await sb.from("contracted_inventory").upsert(row, { onConflict: "kind,supplier_key,external_id" }).select("id").single();
    if (res.error) throw new Error(res.error.message);
    await audit(c, data.id ? "contracted_inventory.update" : "contracted_inventory.create", { id: res.data.id, kind: data.kind });
    return { id: res.data.id as string };
  });

/** Live-verify one contracted item through the existing revalidation step (no booking). */
export const verifyContractedInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = context as unknown as Ctx; await assertStaff(c);
    const sb = await db();
    const { data: r } = await sb.from("contracted_inventory").select("*").eq("id", data.id).single();
    if (!r) throw new Error("Not found");
    const { revalidateOffers } = await import("@/lib/engine/suppliers/revalidate.server");
    const [res] = await revalidateOffers([{ supplierKey: r.supplier_key, kind: r.kind, externalId: r.external_id, title: r.title, start: { at: `${r.valid_from}T00:00:00Z`, timezone: r.timezone, place: r.place }, end: { at: `${r.valid_to}T23:59:00Z`, timezone: r.timezone, place: r.place }, net: { amount: Number(r.net_amount), currency: r.currency }, refundable: r.refundable } as any]);
    const ok = res?.result.status === "confirmed";
    await sb.from("contracted_inventory").update({ last_verified_at: ok ? new Date().toISOString() : null, verification_note: res?.result.reason ?? "No result" }).eq("id", data.id);
    await audit(c, "contracted_inventory.verify", { id: data.id, status: res?.result.status });
    return { status: res?.result.status ?? "unknown", reason: res?.result.reason ?? "" };
  });

export const runRecheckNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = context as unknown as Ctx; await assertStaff(c);
    const { runScheduledRecheck } = await import("@/lib/engine/intelligence/intel.server");
    const r = await runScheduledRecheck();
    await audit(c, "intel.recheck_now", r);
    return r;
  });
