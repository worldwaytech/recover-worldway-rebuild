// Live intelligent package assembly:
// requirements → live search → normalize → trip graph → rank → audit → commercial
// pricing → booking readiness. Real supplier data only; gaps are on-request.
import type { CanonicalOffer } from "../normalize";
import { runPackagePipeline, type PipelinePackage } from "../package";
import { bookingBlockers } from "../capabilities";
import type { TripRequirements } from "../types";
import { supplierRegistry } from "./catalog.server";
import { commercialRuleFor } from "./commercial.server";
import { localDateIn, searchActivitiesOnRequest, searchFlightsCanonical, searchHotelsCanonical, type OnRequestItem } from "./live-search.server";

export interface AssembledProposal {
  id: string;
  offers: CanonicalOffer[];
  result: PipelinePackage;
  readiness: { bookable: boolean; blockers: string[]; perComponent: { externalId: string; blockers: string[]; revalidated: boolean }[] };
  onRequest: OnRequestItem[];
}

export interface AssemblyReport {
  proposals: AssembledProposal[];
  sources: { step: string; count: number; error: string | null }[];
  currency: string;
}

export function readinessOf(offers: CanonicalOffer[], p: PipelinePackage): AssembledProposal["readiness"] {
  const reg = supplierRegistry();
  const perComponent = offers.map((o) => ({ externalId: o.externalId, blockers: bookingBlockers(reg.get(o.supplierKey)).map(String), revalidated: !!o.revalidatedAt }));
  const blockers = [...new Set([...perComponent.flatMap((c) => c.blockers.map((b) => `${b} not certified`)), ...(perComponent.some((c) => !c.revalidated) ? ["live revalidation required"] : []), ...p.issues.filter((i) => i.severity === "error").map((i) => i.message)])];
  return { bookable: p.bookable, blockers, perComponent };
}

/** Pure combination + pipeline step (tested without network). */
export function combine(req: TripRequirements, outbound: CanonicalOffer[], stays: Map<string, CanonicalOffer[]>, inbound: CanonicalOffer[], currency: string, onRequest: OnRequestItem[]) {
  const candidates: { id: string; offers: CanonicalOffer[] }[] = [];
  for (const out of outbound.slice(0, 3)) {
    const checkIn = localDateIn(out.end.at, out.end.timezone);
    const hotels = stays.get(checkIn) ?? [];
    const ret = inbound.find((r) => Date.parse(r.start.at) > Date.parse(out.end.at));
    for (const h of hotels.length ? hotels.slice(0, 3) : [null]) {
      const offers = [out, ...(h ? [h] : []), ...(ret ? [ret] : [])];
      candidates.push({ id: `P${candidates.length + 1}`, offers });
    }
  }
  const results = runPackagePipeline({ requirements: req, candidates, registry: supplierRegistry(), currency, fx: { [currency]: 1 }, ruleFor: commercialRuleFor });
  return results.map((r) => {
    const offers = candidates.find((c) => c.id === r.id)!.offers;
    const extra: OnRequestItem[] = [
      { kind: "transfer", title: "Airport ↔ hotel transfers", reason: "No certified live transfer supplier; arranged on request.", indicativeFrom: null, ref: "transfer" },
      ...(offers.some((o) => o.kind === "stay") ? [] : [{ kind: "stay", title: "Hotel for your arrival date", reason: "No live hotel availability returned.", indicativeFrom: null, ref: "stay" }]),
      ...(offers.filter((o) => o.kind === "flight").length < 2 ? [{ kind: "flight", title: "Return flight", reason: "No live return flight after arrival.", indicativeFrom: null, ref: "return" }] : []),
      ...onRequest,
    ];
    return { id: r.id, offers, result: r, readiness: readinessOf(offers, r), onRequest: extra } satisfies AssembledProposal;
  });
}

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
  // Hotel dates come from ACTUAL flight arrival, never the package date.
  const checkIns = [...new Set(out.offers.slice(0, 3).map((o) => localDateIn(o.end.at, o.end.timezone)))];
  const stays = new Map<string, CanonicalOffer[]>();
  const hotelErrors: string[] = [];
  for (const ci of checkIns) {
    const checkout = back.offers[0] ? localDateIn(back.offers[0].start.at, back.offers[0].start.timezone) : req.returnBy;
    if (checkout <= ci) continue;
    const h = await searchHotelsCanonical(destIata, ci, checkout, req.adults, currency);
    stays.set(ci, h.offers);
    if (h.error) hotelErrors.push(h.error);
  }
  const activities = await searchActivitiesOnRequest(dest, req.departFrom, req.returnBy, currency).catch(() => []);
  const proposals = out.offers.length ? combine(req, out.offers, stays, back.offers, currency, activities) : [];
  return {
    currency,
    proposals: proposals.slice(0, 3),
    sources: [
      { step: "outbound flights", count: out.offers.length, error: out.error },
      { step: "return flights", count: back.offers.length, error: back.error },
      { step: "hotels", count: [...stays.values()].reduce((s, x) => s + x.length, 0), error: hotelErrors[0] ?? null },
      { step: "activities (on request)", count: activities.length, error: null },
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
