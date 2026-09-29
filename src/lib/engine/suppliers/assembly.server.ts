import type { FxTable } from "../pricing";
// Live intelligent package assembly:
// Search → Normalize → Trip Graph → Rank → Optimize → Revalidate → Audit →
// Price → Booking Readiness. Real supplier data only; gaps are on-request.
import type { CanonicalOffer } from "../normalize";
import { runPackagePipeline, type PipelinePackage } from "../package";
import { bookingBlockers } from "../capabilities";
import { classifyOffer, isFresh, type ComponentStatus } from "../classify";
import type { ComponentKind, TripRequirements } from "../types";
import { liveStatus, SUPPLIER_CATALOG, supplierRegistry } from "./catalog.server";
import { commercialRuleFor } from "./commercial.server";
import { localDateIn, searchActivitiesOnRequest, searchCruisesCanonical, searchFlightsCanonical, searchHotelsCanonical, type OnRequestItem } from "./live-search.server";
import type { RevalidationResult } from "./revalidate.server";

export interface ClassifiedOnRequest extends OnRequestItem { status: ComponentStatus }

export interface AssembledProposal {
  id: string;
  offers: CanonicalOffer[];
  result: PipelinePackage;
  readiness: {
    bookable: boolean;
    blockers: string[];
    perComponent: { externalId: string; kind: ComponentKind; status: ComponentStatus; blockers: string[]; revalidated: boolean; revalidation: RevalidationResult | null }[];
  };
  onRequest: ClassifiedOnRequest[];
}

export interface AssemblyReport {
  proposals: AssembledProposal[];
  sources: { step: string; count: number; error: string | null }[];
  /** Product coverage by capability (internal: supplier keys). */
  coverage: { supplierKey: string; kinds: ComponentKind[]; live: string; usedInAssembly: boolean; bookable: boolean }[];
  currency: string;
}

export function readinessOf(offers: CanonicalOffer[], p: PipelinePackage, revalidation: Map<string, RevalidationResult> = new Map(), now = Date.now()): AssembledProposal["readiness"] {
  const reg = supplierRegistry();
  const perComponent = offers.map((o) => {
    const r = reg.get(o.supplierKey);
    const rv = revalidation.get(o.externalId) ?? null;
    const blockers = bookingBlockers(r).map((b) => `${b} not certified`);
    if (!o.revalidatedAt) blockers.push("live revalidation required");
    else if (!isFresh(o.revalidatedAt, now)) blockers.push("revalidation expired — re-check required");
    if (rv?.status === "changed") blockers.push("price changed — customer approval required");
    return { externalId: o.externalId, kind: o.kind, status: classifyOffer(o, r, { priced: !!p.pricing, now }), blockers, revalidated: !!o.revalidatedAt, revalidation: rv };
  });
  const blockers = [...new Set([...perComponent.flatMap((c) => c.blockers), ...p.issues.filter((i) => i.severity === "error").map((i) => i.message)])];
  const bookable = p.bookable && blockers.length === 0 && perComponent.every((c) => c.status === "BOOKABLE");
  return { bookable, blockers, perComponent };
}

function onRequestFor(offers: CanonicalOffer[], extra: OnRequestItem[]): ClassifiedOnRequest[] {
  const reg = supplierRegistry();
  const liveKind = (k: ComponentKind) => SUPPLIER_CATALOG.some((s) => s.kinds.includes(k) && liveStatus(s) === "LIVE");
  const items: OnRequestItem[] = [
    { kind: "transfer", title: "Airport ↔ hotel transfers", reason: "No production-live transfer supplier; arranged on request.", indicativeFrom: null, ref: "transfer" },
    ...(offers.some((o) => o.kind === "stay" && reg.get(o.supplierKey)?.readiness === "production") ? [] : [{ kind: "stay", title: "Hotel for your arrival date", reason: "No live production hotel availability for these dates.", indicativeFrom: null, ref: "stay" }]),
    ...(offers.filter((o) => o.kind === "flight").length < 2 ? [{ kind: "flight", title: "Return flight", reason: "No live return flight after arrival.", indicativeFrom: null, ref: "return" }] : []),
    ...(liveKind("insurance") ? [] : [{ kind: "insurance", title: "Travel insurance", reason: "Insurance supplier not yet production-certified; quoted on request.", indicativeFrom: null, ref: "insurance" }]),
    ...extra,
  ];
  return items.map((i) => ({ ...i, status: "ON_REQUEST" as const }));
}

/** Pure combination + pipeline step (tested without network). */
export function combine(req: TripRequirements, outbound: CanonicalOffer[], stays: Map<string, CanonicalOffer[]>, inbound: CanonicalOffer[], currency: string, onRequest: OnRequestItem[], cruises: CanonicalOffer[] = [], fx: FxTable = { [currency]: 1 }) {
  const candidates: { id: string; offers: CanonicalOffer[] }[] = [];
  for (const out of outbound.slice(0, 3)) {
    const checkIn = localDateIn(out.end.at, out.end.timezone);
    const hotels = stays.get(checkIn) ?? [];
    const ret = inbound.find((r) => Date.parse(r.start.at) > Date.parse(out.end.at));
    // Cruise only when it embarks after actual arrival and ends before onward travel.
    const cruise = cruises.find((c) => Date.parse(c.start.at) > Date.parse(out.end.at) && (!ret || Date.parse(c.end.at) < Date.parse(ret.start.at)));
    for (const h of hotels.length ? hotels.slice(0, 3) : [null]) {
      const offers = [out, ...(h ? [h] : []), ...(cruise ? [cruise] : []), ...(ret ? [ret] : [])];
      candidates.push({ id: `P${candidates.length + 1}`, offers });
    }
  }
  return runCandidates(req, candidates, currency, onRequest, new Map(), fx);
}

function runCandidates(req: TripRequirements, candidates: { id: string; offers: CanonicalOffer[] }[], currency: string, onRequest: OnRequestItem[], revalidation: Map<string, RevalidationResult>, fx: FxTable = { [currency]: 1 }) {
  const results = runPackagePipeline({ requirements: req, candidates, registry: supplierRegistry(), currency, fx, ruleFor: commercialRuleFor });
  return results.map((r) => {
    const offers = candidates.find((c) => c.id === r.id)!.offers;
    return { id: r.id, offers, result: r, readiness: readinessOf(offers, r, revalidation), onRequest: onRequestFor(offers, onRequest) } satisfies AssembledProposal;
  });
}

/** Revalidate the optimised shortlist, then re-audit, re-price and re-check readiness. */
export async function revalidateProposals(req: TripRequirements, shortlist: AssembledProposal[], currency: string, onRequest: OnRequestItem[], check: (o: CanonicalOffer[]) => Promise<{ offer: CanonicalOffer | null; result: RevalidationResult }[]>, fx: FxTable = { [currency]: 1 }) {
  const unique = [...new Map(shortlist.flatMap((p) => p.offers).map((o) => [o.externalId, o])).values()];
  const checked = await check(unique);
  const byId = new Map(checked.map((c) => [c.result.externalId, c]));
  const rv = new Map(checked.map((c) => [c.result.externalId, c.result]));
  const rejectedItems: OnRequestItem[] = [];
  const candidates = shortlist.map((p) => ({
    id: p.id,
    offers: p.offers.flatMap((o) => {
      const c = byId.get(o.externalId);
      if (c && !c.offer) { rejectedItems.push({ kind: o.kind, title: o.title, reason: `Removed: ${c.result.reason}`, indicativeFrom: null, ref: o.externalId }); return []; }
      return [c?.offer ?? o];
    }),
  })).filter((c, i, all) => c.offers.length && all.findIndex((x) => x.offers.map((o) => o.externalId).join() === c.offers.map((o) => o.externalId).join()) === i);
  const proposals = runCandidates(req, candidates, currency, onRequest, rv, fx).map((p) => ({
    ...p,
    onRequest: [...p.onRequest, ...rejectedItems.filter((x) => shortlist.find((s) => s.id === p.id)?.offers.some((o) => o.externalId === x.ref)).map((x) => ({ ...x, status: "UNAVAILABLE" as const }))],
  }));
  return { proposals, revalidation: checked.map((c) => c.result) };
}

const CRUISE_INTEREST = /cruise|voyage|sail/i;

export async function assembleLiveProposals(req: TripRequirements): Promise<AssemblyReport> {
  const cabin = req.luxuryLevel >= 5 ? "business" : "economy";
  const pax = req.adults + req.children;
  const dest = req.destinations[0]!;
  const [out, back] = await Promise.all([
    searchFlightsCanonical(req.origin, dest, req.departFrom, pax, cabin),
    searchFlightsCanonical(dest, req.origin, req.returnBy, pax, cabin),
  ]);
  const currency = out.offers[0]?.net.currency ?? "INR";
  const destIata = out.offers[0]?.end.place ?? out.query?.destination ?? dest;
  // Hotel dates come from ACTUAL flight arrival / onward departure, never the package date.
  const checkIns = [...new Set(out.offers.slice(0, 3).map((o) => localDateIn(o.end.at, o.end.timezone)))];
  const stays = new Map<string, CanonicalOffer[]>();
  const hotelErrors: string[] = [];
  let liveHotels = 0;
  for (const ci of checkIns) {
    const checkout = back.offers[0] ? localDateIn(back.offers[0].start.at, back.offers[0].start.timezone) : req.returnBy;
    if (checkout <= ci) continue;
    const h = await searchHotelsCanonical(destIata, ci, checkout, req.adults, currency);
    stays.set(ci, h.offers);
    liveHotels += h.liveCount;
    if (h.error) hotelErrors.push(h.error);
  }
  const wantsCruise = req.interests.some((i) => CRUISE_INTEREST.test(i));
  const cruise = wantsCruise ? await searchCruisesCanonical(destIata, req.departFrom, req.returnBy, currency).catch(() => ({ offers: [], unscheduled: 0, error: "Cruise search unavailable" })) : null;
  const activities = await searchActivitiesOnRequest(dest, req.departFrom, req.returnBy, currency).catch(() => []);
  const extra: OnRequestItem[] = [
    ...activities,
    ...(cruise && cruise.unscheduled ? [{ kind: "cruise", title: `${cruise.unscheduled} live voyage(s) in your window`, reason: "Embark/disembark times not published for scheduling; confirmed on request.", indicativeFrom: null, ref: "cruise" }] : []),
    { kind: "activity", title: "Guided small-group tours", reason: "Tour suppliers are not production-certified; availability confirmed on request.", indicativeFrom: null, ref: "tours" },
  ];
  // Live FX (approved provider only) for any non-target currencies; failure leaves identity → mixed currencies fail safely.
  const allOffers = [...out.offers, ...back.offers, ...[...stays.values()].flat(), ...(cruise?.offers ?? [])];
  const { approvedFx } = await import("./fx.server");
  const fxr = await approvedFx(currency, [...new Set(allOffers.map((o) => o.net.currency))]);
  const ranked = out.offers.length ? combine(req, out.offers, stays, back.offers, currency, extra, cruise?.offers ?? [], fxr.table) : [];
  // Optimize: shortlist the best-ranked packages, then revalidate before pricing/readiness.
  const shortlist = ranked.slice(0, 3);
  const { revalidateOffers } = await import("./revalidate.server");
  const final = shortlist.length ? await revalidateProposals(req, shortlist, currency, extra, revalidateOffers, fxr.table) : { proposals: [], revalidation: [] };
  const used = new Set(final.proposals.flatMap((p) => p.offers.map((o) => o.supplierKey)));
  const reg = supplierRegistry();
  return {
    currency,
    fx: fxr.audit,
    proposals: final.proposals,
    coverage: SUPPLIER_CATALOG.map((s) => ({ supplierKey: s.supplierKey, kinds: s.kinds, live: liveStatus(s), usedInAssembly: used.has(s.supplierKey), bookable: bookingBlockers(reg.get(s.supplierKey)).length === 0 })),
    sources: [
      { step: "outbound flights", count: out.offers.length, error: out.error },
      { step: "return flights", count: back.offers.length, error: back.error },
      { step: "hotels (live)", count: liveHotels, error: hotelErrors[0] ?? null },
      { step: "hotels (sandbox, on request)", count: [...stays.values()].reduce((s, x) => s + x.length, 0) - liveHotels, error: null },
      ...(cruise ? [{ step: "cruises (live)", count: cruise.offers.length, error: cruise.error }] : []),
      { step: "activities (on request)", count: activities.length, error: null },
      { step: "revalidated", count: final.revalidation.filter((r) => r.status === "confirmed" || r.status === "changed").length, error: final.revalidation.some((r) => r.status === "rejected") ? `${final.revalidation.filter((r) => r.status === "rejected").length} offer(s) rejected on revalidation` : null },
    ],
  };
}

/** Change → Search → Rebuild affected component: fresh live alternatives for one component. */
export async function liveAlternativesFor(component: CanonicalOffer, req: TripRequirements): Promise<CanonicalOffer[]> {
  if (component.kind === "flight") {
    const date = localDateIn(component.start.at, component.start.timezone);
    return (await searchFlightsCanonical(component.start.place, component.end.place, date, req.adults + req.children, req.luxuryLevel >= 5 ? "business" : "economy")).offers.filter((o) => o.externalId !== component.externalId).slice(0, 5);
  }
  if (component.kind === "stay") {
    const ci = localDateIn(component.start.at, component.start.timezone), co = localDateIn(component.end.at, component.end.timezone);
    return (await searchHotelsCanonical(component.start.place, ci, co, req.adults, component.net.currency)).offers.filter((o) => o.externalId !== component.externalId);
  }
  return [];
}
