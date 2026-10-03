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
import { localDateIn, searchActivitiesOnRequest, searchCruisesCanonical, searchFlightsCanonical, searchHotelsCanonical, searchToursLive, tourToCanonical, type OnRequestItem } from "./live-search.server";
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
  /** FX audit: provider, rate timestamp, rates used (null provider = identity only). */
  fx: import("./fx.server").FxAudit;
  proposals: AssembledProposal[];
  sources: { step: string; count: number; error: string | null }[];
  /** Product coverage by capability (internal: supplier keys). */
  coverage: { supplierKey: string; kinds: ComponentKind[]; live: string; usedInAssembly: boolean; bookable: boolean }[];
  currency: string;
  /**
   * Optional pre-/post-tour hotels around multi-day tours that include their own
   * accommodation. NEVER part of any proposal's offers, itinerary, booking or total.
   */
  optionalStays: OptionalTourStay[];
  /** Eligible live tours the customer can choose (fit actual arrival → onward departure). */
  tours: OnRequestItem[];
  /** The customer's selected tour, when one was chosen and is still live. */
  selectedTour: (OnRequestItem & { coversNights: { checkin: string; checkout: string } | null }) | null;
  arrivalDate: string | null;
  departureDate: string | null;
}

export interface OptionalTourStay {
  tourRef: string;
  tourTitle: string;
  position: "pre-tour" | "post-tour";
  checkin: string;
  checkout: string;
  offers: CanonicalOffer[];
  optional: true;
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


export interface MultiCityJourney {
  transports: CanonicalOffer[];
  stays: CanonicalOffer[];
}

/**
 * Deterministic multi-city proposal constructor. It never invents a city date:
 * each next-city transport is anchored to an actual preceding arrival and the
 * supplier's published departure timestamp.
 */
export function combineMultiCity(
  req: TripRequirements,
  journeys: MultiCityJourney[],
  currency: string,
  onRequest: OnRequestItem[],
  fx: FxTable = { [currency]: 1 },
) {
  const candidates = journeys.map((j, i) => ({
    id: "MC" + (i + 1),
    offers: [...j.transports, ...j.stays],
  }));
  return runCandidates(req, candidates, currency, onRequest, new Map(), fx);
}

async function searchFlightsForDates(
  origin: string,
  destination: string,
  dates: string[],
  passengers: number,
  cabin: "economy" | "business",
) {
  const results = await Promise.all(
    [...new Set(dates)].map((date) =>
      searchFlightsCanonical(origin, destination, date, passengers, cabin)
        .catch(() => ({ offers: [], error: "Flight search unavailable", query: undefined }))
    ),
  );
  return results.flatMap((r) => r.offers);
}

async function assembleMultiCityLiveProposals(req: TripRequirements, opts: AssemblyOptions): Promise<AssemblyReport> {
  const cabin = req.luxuryLevel >= 5 ? "business" : "economy";
  const pax = req.adults + req.children;
  const destinations = req.destinations;
  const first = destinations[0]!;
  const last = destinations[destinations.length - 1]!;
  const out = await searchFlightsCanonical(req.origin, first, req.departFrom, pax, cabin);
  const back = await searchFlightsCanonical(last, req.origin, req.returnBy, pax, cabin);
  const currency = out.offers[0]?.net.currency ?? back.offers[0]?.net.currency ?? "INR";
  const arrivalDate = out.offers[0] ? localDateIn(out.offers[0].end.at, out.offers[0].end.timezone) : null;
  const departureDate = back.offers[0] ? localDateIn(back.offers[0].start.at, back.offers[0].start.timezone) : req.returnBy;

  let frontier = out.offers.slice(0, 3).map((transport) => ({ transports: [transport] }));
  for (let i = 0; i < destinations.length - 1 && frontier.length; i += 1) {
    const from = destinations[i]!;
    const to = destinations[i + 1]!;
    const dates = frontier.flatMap((x) => {
      const arrival = x.transports.at(-1)!;
      // Search the next-city inventory from the actual arrival's LOCAL calendar date.
      // UTC date can differ from destination-local date around midnight.
      const localArrivalDate = localDateIn(arrival.end.at, arrival.end.timezone);
      const anchor = new Date(localArrivalDate + "T00:00:00Z");
      const values: string[] = [];
      for (let d = 0; d < 7; d += 1) {
        const day = new Date(anchor);
        day.setUTCDate(day.getUTCDate() + d);
        const iso = day.toISOString().slice(0, 10);
        if (iso < req.returnBy) values.push(iso);
      }
      return values;
    });
    const flights = await searchFlightsForDates(from, to, dates, pax, cabin);
    const next: { transports: CanonicalOffer[] }[] = [];
    for (const state of frontier) {
      const previous = state.transports.at(-1)!;
      const candidates = flights
        .filter((f) =>
          Date.parse(f.start.at) > Date.parse(previous.end.at) &&
          back.offers.some((r) => Date.parse(f.end.at) < Date.parse(r.start.at))
        )
        .sort((a, b) => Date.parse(a.start.at) - Date.parse(b.start.at))
        .slice(0, 2);
      for (const flight of candidates) next.push({ transports: [...state.transports, flight] });
    }
    frontier = next.slice(0, 12);
  }

  const complete = frontier.flatMap((state) => back.offers
    .filter((r) => Date.parse(r.start.at) > Date.parse(state.transports.at(-1)!.end.at))
    .slice(0, 2)
    .map((r) => ({ ...state, transports: [...state.transports, r] })));

  const stayQueries = new Map<string, { city: string; checkin: string; checkout: string }>();
  for (const state of complete) {
    for (let i = 0; i < destinations.length; i += 1) {
      const arrival = state.transports[i]!;
      const onward = state.transports[i + 1]!;
      const checkin = localDateIn(arrival.end.at, arrival.end.timezone);
      const checkout = localDateIn(onward.start.at, onward.start.timezone);
      if (checkout > checkin) {
        const key = destinations[i] + "|" + checkin + "|" + checkout;
        stayQueries.set(key, { city: destinations[i]!, checkin, checkout });
      }
    }
  }

  const stayMap = new Map<string, CanonicalOffer[]>();
  await Promise.all([...stayQueries.values()].map(async (q) => {
    const h = await searchHotelsCanonical(q.city, q.checkin, q.checkout, req.adults, currency);
    stayMap.set(q.city + "|" + q.checkin + "|" + q.checkout, h.offers);
  }));

  const journeys: MultiCityJourney[] = complete.map((state) => ({
    transports: state.transports,
    stays: destinations.flatMap((city, i) => {
      const arrival = state.transports[i]!;
      const onward = state.transports[i + 1]!;
      const checkin = localDateIn(arrival.end.at, arrival.end.timezone);
      const checkout = localDateIn(onward.start.at, onward.start.timezone);
      return checkout > checkin ? (stayMap.get(city + "|" + checkin + "|" + checkout) ?? []).slice(0, 2) : [];
    }),
  }));

  const { approvedFx } = await import("./fx.server");
  const allOffers = journeys.flatMap((j) => [...j.transports, ...j.stays]);
  const fxr = await approvedFx(currency, [...new Set(allOffers.map((o) => o.net.currency))]);
  const extra: OnRequestItem[] = [
    { kind: "transfer", title: "Inter-city and airport transfers", reason: "Ground transport must be confirmed against the final chronological itinerary.", indicativeFrom: null, ref: "multi-city-transfer" },
    { kind: "insurance", title: "Travel insurance", reason: "Insurance supplier is not production-certified.", indicativeFrom: null, ref: "insurance" },
  ];
  const ranked = journeys.length ? combineMultiCity(req, journeys, currency, extra, fxr.table) : [];
  const shortlist = ranked.slice(0, 3);
  const { revalidateOffers } = await import("./revalidate.server");
  const final = shortlist.length ? await revalidateProposals(req, shortlist, currency, extra, revalidateOffers, fxr.table) : { proposals: [], revalidation: [] };
  const used = new Set(final.proposals.flatMap((p) => p.offers.map((o) => o.supplierKey)));
  const reg = supplierRegistry();
  return {
    currency,
    fx: fxr.audit,
    optionalStays: [],
    tours: [],
    selectedTour: null,
    arrivalDate,
    departureDate,
    proposals: final.proposals,
    coverage: SUPPLIER_CATALOG.map((s) => ({ supplierKey: s.supplierKey, kinds: s.kinds, live: liveStatus(s), usedInAssembly: used.has(s.supplierKey), bookable: bookingBlockers(s).length === 0 })),
    sources: [
      { step: "outbound", count: out.offers.length, error: out.error },
      { step: "multi-city-transports", count: complete.length, error: complete.length ? null : "No chronological multi-city transport chain found" },
      { step: "return", count: back.offers.length, error: back.error },
    ],
  };
}

/** Pure combination + pipeline step (tested without network). */
export function combine(req: TripRequirements, outbound: CanonicalOffer[], stays: Map<string, CanonicalOffer[]>, inbound: CanonicalOffer[], currency: string, onRequest: OnRequestItem[], cruises: CanonicalOffer[] = [], fx: FxTable = { [currency]: 1 }, fixed: CanonicalOffer[] = []) {
  const candidates: { id: string; offers: CanonicalOffer[] }[] = [];
  for (const out of outbound.slice(0, 3)) {
    const checkIn = localDateIn(out.end.at, out.end.timezone);
    const hotels = stays.get(checkIn) ?? [];
    const ret = inbound.find((r) => Date.parse(r.start.at) > Date.parse(out.end.at));
    // Cruise only when it embarks after actual arrival and ends before onward travel.
    const cruise = cruises.find((c) => Date.parse(c.start.at) > Date.parse(out.end.at) && (!ret || Date.parse(c.end.at) < Date.parse(ret.start.at)));
    for (const h of hotels.length ? hotels.slice(0, 3) : [null]) {
      const offers = [out, ...(h ? [h] : []), ...(cruise ? [cruise] : []), ...fixed.filter((f) => Date.parse(f.start.at) >= Date.parse(out.end.at)), ...(ret ? [ret] : [])];
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

export interface AssemblyOptions { tourRef?: string; tourQuery?: string }

export async function assembleLiveProposals(req: TripRequirements, opts: AssemblyOptions = {}): Promise<AssemblyReport> {
  if (req.destinations.length > 1) return assembleMultiCityLiveProposals(req, opts);
  const cabin = req.luxuryLevel >= 5 ? "business" : "economy";
  const pax = req.adults + req.children;
  const dest = req.destinations[0]!;
  const [out, back] = await Promise.all([
    searchFlightsCanonical(req.origin, dest, req.departFrom, pax, cabin),
    searchFlightsCanonical(dest, req.origin, req.returnBy, pax, cabin),
  ]);
  const currency = out.offers[0]?.net.currency ?? "INR";
  const destIata = out.offers[0]?.end.place ?? out.query?.destination ?? dest;
  // All hotel/tour/activity dates come from the ACTUAL flight arrival (local destination date), never departure.
  const arrivalDate = out.offers[0] ? localDateIn(out.offers[0].end.at, out.offers[0].end.timezone) : null;
  const departureDate = back.offers[0] ? localDateIn(back.offers[0].start.at, back.offers[0].start.timezone) : req.returnBy;

  // Tours first: a selected tour with included accommodation removes those hotel nights.
  const { stayPlanAroundTour } = await import("../tour-stays");
  const tours = arrivalDate ? await searchToursLive(destIata, arrivalDate, departureDate, req.adults, req.children, opts.tourQuery).catch(() => []) : [];
  let chosen = opts.tourRef ? tours.find((t) => t.ref === opts.tourRef) ?? null : null;
  if (!chosen && opts.tourRef && arrivalDate) {
    // Selected tour may fall outside the ranked list — re-check it live by reference.
    const slug = opts.tourRef.replace(/^tour:/, "").split("|")[0]!;
    const all = await searchToursLive(destIata, arrivalDate, departureDate, req.adults, req.children, undefined, 60).catch(() => []);
    chosen = all.find((t) => t.ref === opts.tourRef) ?? all.find((t) => t.ref.startsWith(`tour:${slug}|`)) ?? null;
  }
  const tourOffer = chosen && out.offers[0] ? await tourToCanonical(chosen, destIata, out.offers[0].end.at, req.adults, req.children) : null;
  const selected = chosen && tourOffer ? chosen : null;
  const plan = selected && arrivalDate
    ? stayPlanAroundTour({ arrivalDate, departureDate, tourStart: selected.startDate!, tourEnd: selected.endDate!, accommodationIncluded: !!selected.accommodationIncluded })
    : null;
  const tourCoversStay = !!plan?.tourNights;

  const checkIns = [...new Set(out.offers.slice(0, 3).map((o) => localDateIn(o.end.at, o.end.timezone)))];
  const stays = new Map<string, CanonicalOffer[]>();
  const hotelErrors: string[] = [];
  let liveHotels = 0;
  // FIT hotels for the stay — skipped when the selected tour's own accommodation covers the trip (no duplicates);
  // nights before/after such a tour are offered only as OPTIONAL stays below.
  // Independent live searches run concurrently (same inputs, same order of results).
  const { contractedStaysFor, mergeInventory } = await import("../intelligence/intel.server");
  const stayResults = tourCoversStay ? [] : await Promise.all(
    checkIns.filter((ci) => departureDate > ci).map(async (ci) => {
      const [h, contracted] = await Promise.all([
        searchHotelsCanonical(destIata, ci, departureDate, req.adults, currency),
        contractedStaysFor(destIata, ci, departureDate, currency),
      ]);
      return { ci, h, contracted };
    }),
  );
  for (const { ci, h, contracted } of stayResults) {
    stays.set(ci, contracted.length ? mergeInventory(contracted, h.offers).map((x) => x.offer) : h.offers);
    liveHotels += h.liveCount;
    if (h.error) hotelErrors.push(h.error);
  }
  const wantsCruise = req.interests.some((i) => CRUISE_INTEREST.test(i));
  const around = selected ? (tourCoversStay ? [selected] : []) : tours.filter((x) => x.accommodationIncluded).slice(0, 2);
  const windows = arrivalDate ? around.flatMap((t) => {
    const w2 = stayPlanAroundTour({ arrivalDate, departureDate, tourStart: t.startDate!, tourEnd: t.endDate!, accommodationIncluded: true });
    return ([["pre-tour", w2.optionalPre], ["post-tour", w2.optionalPost]] as const).flatMap(([position, w]) => (w ? [{ t, position, w }] : []));
  }) : [];
  const [cruise, activities, optionalResults] = await Promise.all([
    wantsCruise ? searchCruisesCanonical(destIata, arrivalDate ?? req.departFrom, departureDate, currency).catch(() => ({ offers: [], unscheduled: 0, error: "Cruise search unavailable" })) : Promise.resolve(null),
    searchActivitiesOnRequest(dest, arrivalDate ?? req.departFrom, departureDate, currency).catch(() => []),
    // Optional pre/post-tour hotels (separate; never added to proposals, itinerary, booking or totals).
    Promise.all(windows.map(({ w }) => searchHotelsCanonical(destIata, w.checkin, w.checkout, req.adults, currency).catch(() => ({ offers: [] as CanonicalOffer[] })))),
  ]);
  const optionalStays: OptionalTourStay[] = [];
  windows.forEach(({ t, position, w }, i) => {
    const h = optionalResults[i]!;
    if (h.offers.length) optionalStays.push({ tourRef: t.ref, tourTitle: t.title, position, checkin: w.checkin, checkout: w.checkout, offers: h.offers.slice(0, 3), optional: true });
  });
  const extra: OnRequestItem[] = [
    ...activities,
    ...(cruise && cruise.unscheduled ? [{ kind: "cruise", title: `${cruise.unscheduled} live voyage(s) in your window`, reason: "Embark/disembark times not published for scheduling; confirmed on request.", indicativeFrom: null, ref: "cruise" }] : []),
    ...(selected ? [] : tours),
  ];
  const fixed = tourOffer ? [tourOffer] : [];
  // Live FX (approved provider only) for any non-target currencies; failure leaves identity → mixed currencies fail safely.
  const allOffers = [...out.offers, ...back.offers, ...[...stays.values()].flat(), ...(cruise?.offers ?? []), ...fixed];
  const { approvedFx } = await import("./fx.server");
  const fxr = await approvedFx(currency, [...new Set(allOffers.map((o) => o.net.currency))]);
  // A chosen tour pins the plan: only outbound flights landing before the tour starts may pair with it.
  const outbound = tourOffer ? out.offers.filter((o) => Date.parse(o.end.at) <= Date.parse(tourOffer.start.at)) : out.offers;
  const ranked = outbound.length ? combine(req, outbound, stays, back.offers, currency, extra, cruise?.offers ?? [], fxr.table, fixed) : [];
  const shortlist = ranked.slice(0, 3);
  const { revalidateOffers } = await import("./revalidate.server");
  const final = shortlist.length ? await revalidateProposals(req, shortlist, currency, extra, revalidateOffers, fxr.table) : { proposals: [], revalidation: [] };
  // Tour accommodation covers the stay → no "hotel on request" placeholder either.
  const proposals = tourCoversStay ? final.proposals.map((p) => ({ ...p, onRequest: p.onRequest.filter((o) => o.ref !== "stay") })) : final.proposals;
  const used = new Set(proposals.flatMap((p) => p.offers.map((o) => o.supplierKey)));
  const reg = supplierRegistry();
  return {
    currency,
    fx: fxr.audit,
    optionalStays,
    tours,
    selectedTour: selected ? { ...selected, coversNights: plan?.tourNights ?? null } : null,
    arrivalDate,
    departureDate,
    proposals,
    coverage: SUPPLIER_CATALOG.map((s) => ({ supplierKey: s.supplierKey, kinds: s.kinds, live: liveStatus(s), usedInAssembly: used.has(s.supplierKey), bookable: bookingBlockers(reg.get(s.supplierKey)).length === 0 })),
    sources: [
      { step: "outbound flights", count: out.offers.length, error: out.error },
      { step: "return flights", count: back.offers.length, error: back.error },
      { step: "hotels (live)", count: liveHotels, error: tourCoversStay ? null : hotelErrors[0] ?? null },
      { step: "hotels (sandbox, on request)", count: [...stays.values()].reduce((s, x) => s + x.length, 0) - liveHotels, error: null },
      ...(cruise ? [{ step: "cruises (live)", count: cruise.offers.length, error: cruise.error }] : []),
      { step: "activities (on request)", count: activities.length, error: null },
      { step: "tours (live)", count: tours.length, error: null },
      ...(opts.tourRef ? [{ step: "selected tour", count: selected ? 1 : 0, error: selected ? null : "Selected tour is no longer available for these dates" }] : []),
      { step: "optional pre/post-tour hotels", count: optionalStays.length, error: null },
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
