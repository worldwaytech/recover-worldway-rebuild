// Server-only persistence for trip intelligence: decisions (audit), outcomes
// (learning, ranking only), contracted inventory and scheduled rechecks.
// Written with the service role after the caller has been authorised upstream.
import type { CanonicalOffer } from "../normalize";
import { learnFromOutcomes, mergeInventory, type Outcome } from "./commerce";
import type { ProposalIntel } from "./evaluate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Learned booking success per supplier from the last 90 days of outcomes. */
export async function loadLearning(): Promise<Map<string, number>> {
  try {
    const sb = await admin();
    const { data } = await sb.from("intel_outcomes").select("supplier_key, kind, event")
      .gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString()).limit(20000);
    const rows: Outcome[] = (data ?? []).map((r: any) => ({ supplierKey: r.supplier_key, kind: r.kind, event: r.event }));
    return new Map(learnFromOutcomes(rows).map((s) => [s.supplierKey, s.bookingSuccess]));
  } catch { return new Map(); }
}

/** Idempotent per (event, ref). Failures never break the customer flow. */
export async function recordOutcomes(rows: { supplierKey: string; kind: string; event: Outcome["event"]; ref: string }[]) {
  if (!rows.length) return;
  try {
    const sb = await admin();
    await sb.from("intel_outcomes").upsert(rows.map((r) => ({ supplier_key: r.supplierKey, kind: r.kind, event: r.event, ref: r.ref })), { onConflict: "event,ref", ignoreDuplicates: true });
  } catch { /* learning is best-effort */ }
}

export async function persistDecisions(userId: string, items: { intel: ProposalIntel; journeyId: string | null; score: number; total: number | null; currency: string }[]) {
  if (!items.length) return;
  const sb = await admin();
  const { error } = await sb.from("intel_decisions").insert(items.map(({ intel, journeyId, score, total, currency }) => ({
    user_id: userId, journey_id: journeyId, proposal_id: intel.proposalId, label: intel.label, score, total, currency,
    min_confidence: intel.minConfidence, bookable: intel.bookable, evidence: intel.evidence, risks: intel.risks,
    channels: intel.channels, constraints: intel.constraints, margin: intel.margin, recheck_due: intel.recheckDue,
  })));
  if (error) console.error("intel_decisions insert failed", error.message);
}

/** Active contracted inventory as canonical offers (never bookable until revalidated live). */
export async function contractedOffers(kind?: string): Promise<CanonicalOffer[]> {
  const sb = await admin();
  let q = sb.from("contracted_inventory").select("*").eq("active", true).gte("valid_to", new Date().toISOString().slice(0, 10));
  if (kind) q = q.eq("kind", kind);
  const { data } = await q.limit(500);
  return (data ?? []).map((r: any) => ({
    supplierKey: r.supplier_key, kind: r.kind, externalId: r.external_id, title: r.title,
    start: { at: `${r.valid_from}T00:00:00Z`, timezone: r.timezone, place: r.place },
    end: { at: `${r.valid_to}T23:59:00Z`, timezone: r.timezone, place: r.place },
    net: { amount: Number(r.net_amount), currency: r.currency }, refundable: r.refundable, quality: r.quality ?? undefined,
  })) as CanonicalOffer[];
}

export { mergeInventory };

/**
 * Contracted stays usable for one stay window: active, covering the dates, at the
 * destination, and live-verified in the last 24h. They still pass the normal live
 * revalidation before any proposal can be booked; a live duplicate always wins.
 */
export async function contractedStaysFor(place: string, checkin: string, checkout: string, currency: string): Promise<CanonicalOffer[]> {
  try {
    const sb = await admin();
    const { data } = await sb.from("contracted_inventory").select("*").eq("active", true).eq("kind", "stay").ilike("place", place)
      .lte("valid_from", checkin).gte("valid_to", checkout).gte("last_verified_at", new Date(Date.now() - 864e5).toISOString()).limit(20);
    return (data ?? []).filter((r: any) => r.currency === currency).map((r: any) => ({
      supplierKey: r.supplier_key, kind: "stay", externalId: r.external_id, title: r.title,
      start: { at: `${checkin}T14:00:00Z`, timezone: r.timezone, place: r.place },
      end: { at: `${checkout}T10:00:00Z`, timezone: r.timezone, place: r.place },
      net: { amount: Number(r.net_amount), currency: r.currency }, refundable: r.refundable, quality: r.quality ?? undefined,
      observedAt: r.last_verified_at,
    })) as CanonicalOffer[];
  } catch { return []; }
}

/** Scheduled recheck: bounded, rate-limited, never books or changes a journey. */
export async function runScheduledRecheck(opts: { maxDecisions?: number; maxOffers?: number; minGapMin?: number } = {}) {
  const maxDecisions = opts.maxDecisions ?? 10, maxOffers = opts.maxOffers ?? 20, gap = opts.minGapMin ?? 30;
  const sb = await admin();
  const { data: run } = await sb.from("intel_recheck_runs").insert({}).select("id").single();
  const cutoff = new Date(Date.now() - gap * 60_000).toISOString();
  const { data: rows } = await sb.from("intel_decisions").select("id, journey_id, last_rechecked_at, recheck_due")
    .not("journey_id", "is", null).gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
    .or(`last_rechecked_at.is.null,last_rechecked_at.lt.${cutoff}`)
    .order("last_rechecked_at", { ascending: true, nullsFirst: true }).limit(maxDecisions);
  const { revalidateOffers } = await import("../suppliers/revalidate.server");
  let checked = 0, skipped = 0, failed = 0, offersUsed = 0;
  for (const d of rows ?? []) {
    if (!Array.isArray(d.recheck_due) || !d.recheck_due.length) { skipped++; continue; }
    const { data: j } = await sb.from("journeys").select("current_version").eq("id", d.journey_id).maybeSingle();
    const { data: v } = j ? await sb.from("journey_versions").select("offers").eq("journey_id", d.journey_id).eq("version", j.current_version).maybeSingle() : { data: null };
    const due = new Set(d.recheck_due.map((x: any) => x.componentId));
    const offers = ((v?.offers ?? []) as CanonicalOffer[]).filter((o) => due.has(o.externalId) || due.size === 0);
    if (!offers.length || offersUsed + offers.length > maxOffers) { skipped++; continue; }
    offersUsed += offers.length;
    try {
      const res = await revalidateOffers(offers);
      const status = res.every((r) => r.result.status === "confirmed") ? "confirmed" : res.some((r) => r.result.status === "rejected") ? "changed_or_unavailable" : res.map((r) => r.result.status).join(",");
      await sb.from("intel_decisions").update({ last_rechecked_at: new Date().toISOString(), recheck_status: status, recheck_due: res.filter((r) => r.result.status !== "confirmed").map((r) => ({ componentId: r.result.externalId, reason: r.result.reason })) }).eq("id", d.id);
      checked++;
    } catch { failed++; await sb.from("intel_decisions").update({ last_rechecked_at: new Date().toISOString(), recheck_status: "check_failed" }).eq("id", d.id); }
  }
  await sb.from("intel_recheck_runs").update({ finished_at: new Date().toISOString(), checked, skipped, failed, note: `${offersUsed} partner checks` }).eq("id", run?.id);
  return { checked, skipped, failed, offersUsed };
}
