// Travel Commerce Intelligence — deterministic, pure, supplier-agnostic.
// Adds constraint tiers, evidence/confidence, channel readiness, risk/policy checks,
// margin optimisation, merchandising, inventory merge, revalidation scheduling,
// alternatives, outcome learning and input normalisation on top of the existing
// pipeline (package.ts / ranking.ts / simulate.ts). Never invents inventory or prices:
// every function only reads components/offers already returned by live suppliers.
import type { ComponentKind, NormalizedComponent, SupplierRegistration } from "../types";
import type { CanonicalOffer } from "../normalize";
import type { PipelinePackage } from "../package";
import { bookingBlockers } from "../capabilities";

/* ---------- 1. Constraint intelligence: HARD > SOFT > PREFERENCE > NICE ---------- */
export type ConstraintTier = "hard" | "soft" | "preference" | "nice";
export interface Constraint {
  id: string;
  tier: ConstraintTier;
  label: string;
  test: (items: NormalizedComponent[], total: number | null) => boolean;
}
const TIER_WEIGHT: Record<Exclude<ConstraintTier, "hard">, number> = { soft: 100, preference: 10, nice: 1 };

export interface ConstraintResult {
  feasible: boolean;
  /** Lexicographic: soft dominates preference dominates nice. Higher is better. */
  score: number;
  met: string[];
  violated: { label: string; tier: ConstraintTier }[];
}

export function evaluateConstraints(items: NormalizedComponent[], total: number | null, cs: Constraint[]): ConstraintResult {
  const met: string[] = [];
  const violated: ConstraintResult["violated"] = [];
  let score = 0;
  for (const c of cs) {
    if (c.test(items, total)) {
      met.push(c.label);
      if (c.tier !== "hard") score += TIER_WEIGHT[c.tier];
    } else violated.push({ label: c.label, tier: c.tier });
  }
  return { feasible: !violated.some((v) => v.tier === "hard"), score, met, violated };
}

/** Common constraint builders. */
export const constraints = {
  budget: (max: number, tier: ConstraintTier = "hard"): Constraint => ({ id: "budget", tier, label: `Total within ${max}`, test: (_i, t) => t != null && t <= max }),
  refundable: (tier: ConstraintTier = "preference"): Constraint => ({ id: "refundable", tier, label: "All parts refundable", test: (i) => i.every((c) => c.cancellation.refundable) }),
  minQuality: (q: number, tier: ConstraintTier = "soft"): Constraint => ({ id: "quality", tier, label: `Quality ≥ ${q}`, test: (i) => i.every((c) => (c.quality ?? 0) >= q) }),
  includes: (kind: ComponentKind, tier: ConstraintTier = "hard"): Constraint => ({ id: `has-${kind}`, tier, label: `Includes ${kind}`, test: (i) => i.some((c) => c.kind === kind) }),
};

/* ---------- 2. Confidence / evidence per component ---------- */
export interface Evidence { componentId: string; confidence: number; reasons: string[]; bookable: boolean }

export function componentEvidence(c: NormalizedComponent, reg: SupplierRegistration | undefined, now: string, maxAgeMin = 30): Evidence {
  const reasons: string[] = [];
  let conf = 1;
  const blockers = bookingBlockers(reg);
  if (blockers.length) { conf *= 0.3; reasons.push(`Supplier not production-certified (${blockers.join(", ")})`); }
  if (!c.revalidatedAt) { conf *= 0.4; reasons.push("Not revalidated live"); }
  else {
    const age = (Date.parse(now) - Date.parse(c.revalidatedAt)) / 60_000;
    if (age > maxAgeMin) { conf *= 0.6; reasons.push(`Revalidated ${Math.round(age)} min ago (stale)`); }
    else reasons.push("Live price/availability confirmed");
  }
  conf *= 0.5 + 0.5 * (reg?.reliability ?? 0);
  if (!c.start.timezone || !c.end.timezone) { conf *= 0.5; reasons.push("Timezone missing"); }
  const r = Math.round(conf * 100) / 100;
  return { componentId: c.id, confidence: r, reasons, bookable: !blockers.length && !!c.revalidatedAt && r >= 0.5 };
}

/* ---------- 3. Continuous revalidation schedule ---------- */
export function revalidationDue(items: NormalizedComponent[], now: string, maxAgeMin = 30) {
  const t = Date.parse(now);
  return items
    .filter((c) => !c.revalidatedAt || t - Date.parse(c.revalidatedAt) > maxAgeMin * 60_000)
    .map((c) => ({ componentId: c.id, reason: c.revalidatedAt ? "stale" : "never revalidated" }));
}

/* ---------- 4. Multi-channel readiness (B2C / B2B / B2B2C) ---------- */
export type Channel = "b2c" | "b2b" | "b2b2c";
export interface ChannelPolicy { requiresRefundable?: boolean; minConfidence: number; allowsEnquiryOnly: boolean }
export const DEFAULT_CHANNEL_POLICY: Record<Channel, ChannelPolicy> = {
  b2c: { minConfidence: 0.6, allowsEnquiryOnly: false },
  b2b: { minConfidence: 0.5, allowsEnquiryOnly: true },
  b2b2c: { minConfidence: 0.6, allowsEnquiryOnly: false },
};

export function channelReadiness(pkg: PipelinePackage, ev: Evidence[], policy = DEFAULT_CHANNEL_POLICY) {
  return (Object.keys(policy) as Channel[]).map((ch) => {
    const p = policy[ch];
    const reasons: string[] = [];
    if (!pkg.pricing) reasons.push("No confirmed price");
    if (ev.some((e) => e.confidence < p.minConfidence)) reasons.push(`Component confidence below ${p.minConfidence}`);
    if (!pkg.bookable && !p.allowsEnquiryOnly) reasons.push("Package not bookable");
    if (p.requiresRefundable && pkg.graph.some((c) => !c.cancellation.refundable)) reasons.push("Non-refundable part");
    return { channel: ch, ready: reasons.length === 0, mode: pkg.bookable ? "book" as const : "enquiry" as const, reasons };
  });
}

/* ---------- 5. Package risk, policy and regulatory checks ---------- */
export interface RiskInput { passportExpiry?: string; minPassportMonths?: number; minConnectionMin?: number; now: string }
export interface Risk { code: string; severity: "error" | "warning"; message: string }

export function packageRisks(items: NormalizedComponent[], i: RiskInput): Risk[] {
  const out: Risk[] = [];
  const sorted = [...items].sort((a, b) => Date.parse(a.start.at) - Date.parse(b.start.at));
  const last = sorted.at(-1);
  if (i.passportExpiry && last) {
    const months = i.minPassportMonths ?? 6;
    const need = new Date(last.end.at); need.setUTCMonth(need.getUTCMonth() + months);
    if (Date.parse(i.passportExpiry) < need.getTime()) out.push({ code: "passport-validity", severity: "error", message: `Passport must be valid ${months} months beyond return.` });
  }
  const flights = sorted.filter((c) => c.kind === "flight");
  for (let k = 1; k < flights.length; k++) {
    const gap = (Date.parse(flights[k]!.start.at) - Date.parse(flights[k - 1]!.end.at)) / 60_000;
    if (gap >= 0 && gap < (i.minConnectionMin ?? 60) && flights[k - 1]!.end.place === flights[k]!.start.place)
      out.push({ code: "short-connection", severity: "warning", message: `Connection of ${Math.round(gap)} min at ${flights[k]!.start.place}.` });
  }
  const nonRef = items.filter((c) => !c.cancellation.refundable).length;
  if (nonRef && nonRef === items.length) out.push({ code: "fully-non-refundable", severity: "warning", message: "Every part is non-refundable." });
  for (const c of items) if (c.cancellation.freeUntil && Date.parse(c.cancellation.freeUntil) < Date.parse(i.now))
    out.push({ code: "free-cancel-passed", severity: "warning", message: `${c.title}: free-cancellation deadline has passed.` });
  return out;
}

/* ---------- 6. Margin optimisation within customer constraints ---------- */
/**
 * Highest markup in [min,max] (step 0.5%) whose total still satisfies every HARD
 * constraint. Returns null when even the minimum markup breaks a hard constraint.
 */
export function optimiseMarkup(base: number, minPct: number, maxPct: number, items: NormalizedComponent[], cs: Constraint[]) {
  const hard = cs.filter((c) => c.tier === "hard");
  for (let p = maxPct; p >= minPct - 1e-9; p = Math.round((p - 0.5) * 10) / 10) {
    const total = Math.round(base * (1 + p / 100) * 100) / 100;
    if (hard.every((c) => c.test(items, total))) return { markupPercent: p, total };
  }
  return null;
}

/* ---------- 7. Cross-product merchandising / ancillaries ---------- */
/** Suggest live offers for gaps in the trip (only from offers already returned by suppliers). */
export function suggestAncillaries(items: NormalizedComponent[], liveOffers: CanonicalOffer[], max = 3) {
  const have = new Set(items.map((c) => c.kind));
  const out: { offer: CanonicalOffer; why: string }[] = [];
  const flights = items.filter((c) => c.kind === "flight");
  if (!have.has("transfer") && flights.length && have.has("stay")) {
    const arr = flights[0]!.end.place;
    const t = liveOffers.find((o) => o.kind === "transfer" && o.start.place === arr && o.revalidatedAt);
    if (t) out.push({ offer: t, why: `Arrival transfer from ${arr}` });
  }
  if (!have.has("insurance")) {
    const ins = liveOffers.find((o) => o.kind === "insurance" && o.revalidatedAt);
    if (ins) out.push({ offer: ins, why: "Travel protection for the whole trip" });
  }
  if (!have.has("activity") && have.has("stay")) {
    const stay = items.find((c) => c.kind === "stay")!;
    const act = liveOffers
      .filter((o) => o.kind === "activity" && o.revalidatedAt && Date.parse(o.start.at) >= Date.parse(stay.start.at) && Date.parse(o.end.at) <= Date.parse(stay.end.at))
      .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))[0];
    if (act) out.push({ offer: act, why: "Fits within your stay dates" });
  }
  return out.slice(0, max);
}

/* ---------- 8. Own/contracted + live inventory merge ---------- */
export type InventorySource = "contracted" | "live";
export function mergeInventory(contracted: CanonicalOffer[], live: CanonicalOffer[]) {
  const seen = new Map<string, { offer: CanonicalOffer; source: InventorySource }>();
  for (const o of live) seen.set(`${o.kind}|${o.supplierKey}|${o.externalId}`, { offer: o, source: "live" });
  // Contracted inventory is included but never overrides a live result; it is only
  // bookable once revalidated like any other component.
  for (const o of contracted) { const k = `${o.kind}|${o.supplierKey}|${o.externalId}`; if (!seen.has(k)) seen.set(k, { offer: o, source: "contracted" }); }
  return [...seen.values()];
}

/* ---------- 9. Meaningful alternatives ---------- */
export function packageAlternatives(pkgs: PipelinePackage[]) {
  const priced = pkgs.filter((p) => p.pricing);
  if (!priced.length) return [];
  const pick: { label: string; pkg: PipelinePackage; why: string }[] = [];
  const add = (label: string, pkg: PipelinePackage | undefined, why: string) => { if (pkg && !pick.some((x) => x.pkg.id === pkg.id)) pick.push({ label, pkg, why }); };
  const flex = (p: PipelinePackage) => p.graph.filter((c) => c.cancellation.refundable).length / (p.graph.length || 1);
  add("Recommended", [...priced].sort((a, b) => Number(b.bookable) - Number(a.bookable) || b.score - a.score)[0], "Highest overall score");
  add("Best value", [...priced].sort((a, b) => a.pricing!.total - b.pricing!.total)[0], "Lowest confirmed total");
  add("Most flexible", [...priced].sort((a, b) => flex(b) - flex(a) || b.score - a.score)[0], "Most refundable parts");
  add("Premium", [...priced].sort((a, b) => avgQ(b) - avgQ(a))[0], "Highest quality components");
  return pick;
}
const avgQ = (p: PipelinePackage) => p.graph.reduce((s, c) => s + (c.quality ?? 0), 0) / (p.graph.length || 1);

/** Human-readable trade-off between two packages, from engine facts only. */
export function explainTradeoff(a: PipelinePackage, b: PipelinePackage): string[] {
  const out: string[] = [];
  if (a.pricing && b.pricing) {
    const d = Math.round((b.pricing.total - a.pricing.total) * 100) / 100;
    if (d) out.push(`${b.id} costs ${Math.abs(d).toFixed(2)} ${a.pricing.currency} ${d > 0 ? "more" : "less"}`);
  }
  if (b.score !== a.score) out.push(`Score ${b.score} vs ${a.score}`);
  if (a.bookable !== b.bookable) out.push(`${b.bookable ? b.id : a.id} is bookable now; the other is enquiry-only`);
  return out;
}

/* ---------- 10. Learning from outcomes (never inventory/prices) ---------- */
export interface Outcome { supplierKey: string; kind: ComponentKind; event: "searched" | "booked" | "failed" | "cancelled" }
export function learnFromOutcomes(outcomes: Outcome[]) {
  const by = new Map<string, { booked: number; failed: number; cancelled: number; searched: number }>();
  for (const o of outcomes) {
    const s = by.get(o.supplierKey) ?? { booked: 0, failed: 0, cancelled: 0, searched: 0 };
    s[o.event]++; by.set(o.supplierKey, s);
  }
  return [...by].map(([supplierKey, s]) => {
    const attempts = s.booked + s.failed;
    // Laplace-smoothed success rate; feeds ranking reliability only, never availability.
    return { supplierKey, ...s, bookingSuccess: Math.round(((s.booked + 1) / (attempts + 2)) * 100) / 100, cancelRate: s.booked ? Math.round((s.cancelled / s.booked) * 100) / 100 : 0 };
  });
}

/* ---------- 11. Expanded inputs: WhatsApp export / transcript / itinerary text ---------- */
/** Normalise a WhatsApp chat export or voice transcript into plain text for intent extraction. */
export function normaliseConversation(raw: string, maxChars = 4000): string {
  const lines = raw.split(/\r?\n/).map((l) =>
    l.replace(/^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\]?\s*(?:-\s*)?/, "")
      .replace(/^[^:]{1,40}:\s/, "")
      .replace(/<Media omitted>|This message was deleted/gi, "")
      .trim()).filter(Boolean);
  return lines.join("\n").slice(0, maxChars);
}
