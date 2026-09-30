// Live multi-supplier search → CanonicalOffer. Uses ONLY existing adapters /
// connectors and the capability registry. Search results are never marked
// revalidated, so LIVE never becomes BOOKABLE here.
import type { CanonicalOffer } from "../normalize";
import { supports } from "../capabilities";
import { registrationFor } from "./catalog.server";
import { AIRPORT_TZ } from "./airport-tz.data.server";

let tzIndex: Map<string, { tz: string; lat: number; lng: number }> | null = null;
export function airportTz(iata: string) {
  if (!tzIndex) {
    tzIndex = new Map();
    for (const line of AIRPORT_TZ.split("\n")) {
      const [code, tz, lat, lng] = line.split("|");
      if (code && tz) tzIndex.set(code, { tz, lat: Number(lat), lng: Number(lng) });
    }
  }
  return typeof iata === "string" ? tzIndex.get(iata.toUpperCase()) ?? null : null;
}

/** Local wall time ("YYYY-MM-DD HH:mm" or ISO without offset) in an IANA zone → UTC ISO. */
export function localToInstant(local: string, tz: string): string | null {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(local.trim())) return new Date(local).toISOString();
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  const offset = (at: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - at;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t).toISOString();
}

export function localDateIn(instant: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(instant));
}

// ---------------------------------------------------------------- flights
import { flightOfferHandle, flightOfferSupplier, type WorldwayFlightOffer } from "@/lib/flights/flight-adapters.server";

function flightSupplier(offerId: string): string | null {
  return flightOfferSupplier(offerId);
}

export function flightToCanonical(o: WorldwayFlightOffer): CanonicalOffer | null {
  const sk = typeof o?.offer_id === "string" ? flightSupplier(o.offer_id) : null;
  if (!sk) return null;
  const a = airportTz(o.origin), b = airportTz(o.destination);
  if (!sk || !a || !b || !o.departure || !o.arrival || !(o.total_price > 0)) return null;
  const start = localToInstant(o.departure, a.tz), end = localToInstant(o.arrival, b.tz);
  if (!start || !end) return null;
  return {
    supplierKey: sk, kind: "flight", externalId: o.offer_id,
    title: `${o.airline} ${o.flight_numbers.join("/")} ${o.origin}→${o.destination}`.trim(),
    start: { at: start, timezone: a.tz, place: o.origin, lat: a.lat, lng: a.lng },
    end: { at: end, timezone: b.tz, place: o.destination, lat: b.lat, lng: b.lng },
    // Supplier NET (before Worldway markup) — commercial rules add markup exactly once.
    net: (() => { const h = flightOfferHandle?.(o.offer_id); return h ? { amount: h.net, currency: h.currency } : { amount: o.total_price, currency: o.currency }; })(),
    refundable: o.refundable === true, observedAt: new Date().toISOString(),
  };
}

export async function searchFlightsCanonical(origin: string, destination: string, date: string, passengers: number, cabin: "economy" | "business") {
  const { searchFlightsViaEngine } = await import("@/lib/flights/flight-adapters.server");
  const r = await searchFlightsViaEngine({ origin, destination, depart_date: date, passengers, cabin });
  const offers = ((r as { offers?: WorldwayFlightOffer[] }).offers ?? []).map(flightToCanonical).filter((x): x is CanonicalOffer => !!x);
  return { offers, error: offers.length ? null : ((r as { error?: string }).error ?? "No live flights found"), query: (r as { query?: { origin: string; destination: string } }).query };
}

// ---------------------------------------------------------------- hotels
async function searchRatehawkCanonical(cityIata: string, checkin: string, checkout: string, adults: number, currency: string) {
  const reg = registrationFor("ratehawk");
  if (!supports(reg, "search")) return { offers: [], error: "Hotel search not registered" };
  const place = airportTz(cityIata);
  if (!place) return { offers: [], error: "Unknown destination time zone" };
  const { ratehawkCall, ratehawkCredentialStatus } = await import("@/lib/ratehawk/client.server");
  if (!ratehawkCredentialStatus().configured) return { offers: [], error: "Hotel supplier not configured" };
  const { findAirportByCode } = await import("@/lib/aviation/airports.server");
  const city = findAirportByCode(cityIata)?.city ?? cityIata;
  const mc = await ratehawkCall<{ regions?: { id: number; type?: string; name?: string }[] }>("multicomplete", { query: city, language: "en" });
  const region = mc.ok ? (mc.data.regions ?? []).find((r) => /city/i.test(r.type ?? "")) ?? mc.data.regions?.[0] : undefined;
  if (!region) return { offers: [], error: "Destination not found for hotel search" };
  const { searchHotels, normaliseHotelOffers } = await import("@/lib/ratehawk/hotels.server");
  const res = await searchHotels({ checkin, checkout, residency: "in", currency, guests: [{ adults }], regionId: region.id });
  if (!res.ok) return { offers: [], error: "Live hotel search unavailable" };
  const offers: CanonicalOffer[] = [];
  for (const h of normaliseHotelOffers(res.data).slice(0, 20)) {
    const rate = h.rates.filter((r) => r.price.amount != null && r.price.currency).sort((x, y) => x.price.amount! - y.price.amount!)[0];
    if (!rate) continue;
    // Check-in/out are supplier DATES; anchored at local midnight (date precision).
    offers.push({
      supplierKey: "ratehawk", kind: "stay", externalId: `${h.hotelId}:${rate.matchHash ?? rate.roomName}`,
      title: `${rate.roomName} (hotel ${h.hotelId})`,
      start: { at: localToInstant(`${checkin} 00:00`, place.tz)!, timezone: place.tz, place: cityIata, lat: place.lat, lng: place.lng },
      end: { at: localToInstant(`${checkout} 00:00`, place.tz)!, timezone: place.tz, place: cityIata, lat: place.lat, lng: place.lng },
      net: { amount: rate.price.amount!, currency: rate.price.currency! }, refundable: rate.refundable === true, observedAt: new Date().toISOString(),
    });
  }
  return { offers: offers.sort((a, b) => a.net.amount - b.net.amount).slice(0, 5), error: offers.length ? null : "No live hotel availability" };
}

/** Server-only hotel revalidation handles (never serialised). */
export interface HotelHandle { supplier: "up17"; destination: string; checkin: string; checkout: string; guests: number; hotelCode: string }
const HOTEL_HANDLE = new Map<string, HotelHandle>();
export function hotelHandle(externalId: string) { return HOTEL_HANDLE.get(externalId) ?? null; }

/** Map a UP17 hotel search result to canonical stays (pure — tested without network). */
export function up17HotelsToCanonical(hotels: { hotelCode: string; name: string; starRating: number; totalPrice: number | null; currency: string; rooms: { refundable: boolean }[] }[],
  cityIata: string, checkin: string, checkout: string, observedAt: string): CanonicalOffer[] {
  const place = airportTz(cityIata);
  if (!place) return [];
  const s = localToInstant(`${checkin} 00:00`, place.tz), e = localToInstant(`${checkout} 00:00`, place.tz);
  if (!s || !e) return [];
  return hotels.filter((h) => h.hotelCode && (h.totalPrice ?? 0) > 0 && h.currency).map((h) => ({
    supplierKey: "up17", kind: "stay" as const, externalId: `WWH-${h.hotelCode}:${checkin}:${checkout}`,
    title: `${h.name}${h.starRating ? ` (${h.starRating}★)` : ""}`,
    start: { at: s, timezone: place.tz, place: cityIata, lat: place.lat, lng: place.lng },
    end: { at: e, timezone: place.tz, place: cityIata, lat: place.lat, lng: place.lng },
    net: { amount: h.totalPrice!, currency: h.currency },
    // Refundability only when the supplier states it for every room returned.
    refundable: h.rooms.length > 0 && h.rooms.every((r) => r.refundable), observedAt,
    quality: h.starRating ? Math.min(1, h.starRating / 5) : undefined,
  }));
}

async function searchUp17HotelsCanonical(cityIata: string, checkin: string, checkout: string, adults: number) {
  const reg = registrationFor("up17");
  if (!reg.kinds.includes("stay") || !supports(reg, "search")) return { offers: [] as CanonicalOffer[], error: "Hotel search not registered" };
  const { findAirportByCode } = await import("@/lib/aviation/airports.server");
  const city = findAirportByCode(cityIata)?.city ?? cityIata;
  const { up17SearchHotels, up17ServerIp } = await import("@/lib/up17/up17.server");
  const res = await up17SearchHotels({ destination: city, check_in: checkin, check_out: checkout, guests: adults, rooms: 1, user_ip: await up17ServerIp() } as never);
  if (!res.ok) return { offers: [], error: "Live hotel search unavailable" };
  const offers = up17HotelsToCanonical(res.data?.hotels ?? [], cityIata, checkin, checkout, new Date().toISOString()).slice(0, 5);
  for (const o of offers) HOTEL_HANDLE.set(o.externalId, { supplier: "up17", destination: city, checkin, checkout, guests: adults, hotelCode: o.externalId.slice(4).split(":")[0]! });
  return { offers, error: offers.length ? null : "No live hotel availability" };
}

/** Live hotels (production adapters) first; sandbox/UAT hotel suppliers are kept but classified ON REQUEST. */
export async function searchHotelsCanonical(cityIata: string, checkin: string, checkout: string, adults: number, currency: string) {
  const [live, sandbox] = await Promise.all([
    searchUp17HotelsCanonical(cityIata, checkin, checkout, adults).catch(() => ({ offers: [] as CanonicalOffer[], error: "Live hotel search unavailable" })),
    searchRatehawkCanonical(cityIata, checkin, checkout, adults, currency).catch(() => ({ offers: [] as CanonicalOffer[], error: "Hotel search unavailable" })),
  ]);
  const offers = [...live.offers, ...sandbox.offers];
  return { offers, liveCount: live.offers.length, error: live.offers.length ? null : (live.error ?? sandbox.error) };
}

// ---------------------------------------------------------------- activities (on request)
export interface OnRequestItem {
  kind: string; title: string; reason: string; indicativeFrom: { amount: number; currency: string } | null; ref: string;
  /** Local destination dates (multi-day tours). */
  startDate?: string; endDate?: string; durationDays?: number;
  /** The tour's own inclusions already contain accommodation → no hotel is added for these nights. */
  accommodationIncluded?: boolean;
  image?: string | null;
}

/** Activity search has no scheduled slots at this stage → on-request, never scheduled or priced as final. */
export async function searchActivitiesOnRequest(city: string, startDate: string, endDate: string, currency: string): Promise<OnRequestItem[]> {
  if (!supports(registrationFor("viator-affiliate"), "search")) return [];
  const { searchViator } = await import("@/lib/viator.server");
  const r = await searchViator({ destination: city, startDate, endDate, currency, pageSize: 6 });
  return (r.products ?? []).slice(0, 6).map((p) => ({
    kind: "activity", title: p.title, ref: p.productCode,
    reason: "Time slot and availability must be confirmed live before it can be scheduled.",
    indicativeFrom: p.price != null ? { amount: p.price, currency: p.currency } : null,
  }));
}

/**
 * Live tours for the destination, ranked by real review volume, priced live for
 * the first open date ON/AFTER the actual arrival date that also ends by the
 * onward departure date. Prices are the live customer price (markup applied).
 */
export async function searchToursLive(destIata: string, arrivalDate: string, departureDate: string, adults: number, children: number, query?: string, limit = 8): Promise<OnRequestItem[]> {
  if (!supports(registrationFor("travelshop"), "search")) return [];
  const { tourIncludesAccommodation, tourFitsTrip } = await import("../tour-stays");
  const { findAirportByCode } = await import("@/lib/aviation/airports.server");
  const city = (findAirportByCode(destIata)?.city ?? destIata).replace(/[%,(){}"]/g, " ").trim();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  let q = db.from("travelshop_tours").select("slug, name, duration_days, inclusions, cover_image")
    .eq("is_active", true).or(`start_location.ilike.${city},destinations.cs.{"${city}"}`);
  const text = (query ?? "").replace(/[%,(){}"]/g, " ").trim();
  if (text) q = q.ilike("name", `%${text}%`);
  const { data } = await q.order("review_count", { ascending: false, nullsFirst: false }).limit(Math.max(limit * 5, 40));
  const { liveAvailability } = await import("@/lib/travelshop/catalogue.server");
  const rows = (data ?? []) as { slug: string; name: string; duration_days: number | null; inclusions: unknown; cover_image: string | null }[];
  const check = async (t: (typeof rows)[number]): Promise<OnRequestItem | null> => {
    const av = await liveAvailability(t.slug, arrivalDate, adults + children).catch(() => null);
    const fits = (av?.dates ?? []).filter((x) => tourFitsTrip(x.date, x.endDate || x.date, arrivalDate, departureDate)
      && ((x.endDate || x.date) > x.date || x.date < departureDate)); // day tours can't run on the flight-home day
    const d = fits.find((x) => x.service === "regular") ?? fits[0];
    if (!d) return null;
    const total = d.perUnit > 0 && !(d.perAdult > 0) ? d.perUnit : d.perAdult * adults + (d.perChild > 0 ? d.perChild : d.perAdult) * children;
    const acc = tourIncludesAccommodation(t.inclusions, t.duration_days);
    return {
      kind: "activity", title: t.name, ref: `tour:${t.slug}|${d.date}|${d.service}`,
      startDate: d.date, endDate: d.endDate || d.date, durationDays: t.duration_days ?? undefined, accommodationIncluded: acc, image: t.cover_image,
      reason: acc
        ? `Live price for ${d.date}–${d.endDate || d.date}. Accommodation is included, so no hotel is added for those nights.`
        : `Live price and availability for ${d.date}; start time confirmed by the tour operator before booking.`,
      indicativeFrom: { amount: Math.round(total * 100) / 100, currency: d.currency },
    };
  };
  // Many top-reviewed tours have no dates in a given window — check in small batches until enough fit.
  const found: OnRequestItem[] = [];
  for (let i = 0; i < rows.length && found.length < limit; i += 8) {
    for (const x of await Promise.all(rows.slice(i, i + 8).map(check))) if (x && found.length < limit) found.push(x);
  }
  return found;
}

/** Selected tour → canonical offer (date precision; starts no earlier than actual arrival). Net = live supplier retail. */
export async function tourToCanonical(t: OnRequestItem, destIata: string, arrivalAt: string, adults: number, children: number): Promise<CanonicalOffer | null> {
  const place = airportTz(destIata);
  if (!place || !t.startDate) return null;
  const [slug, date, service] = t.ref.replace(/^tour:/, "").split("|");
  const { liveQuote } = await import("@/lib/travelshop/catalogue.server");
  const q = await liveQuote({ slug: slug!, date: date!, service: service === "private" ? "private" : "regular", adults, children, infants: 0 }).catch(() => null);
  if (!q?.ok) return null;
  const dayStart = localToInstant(`${t.startDate} 00:00`, place.tz)!;
  const start = Date.parse(dayStart) < Date.parse(arrivalAt) ? arrivalAt : dayStart;
  const multi = (t.endDate ?? t.startDate) > t.startDate;
  const end = multi ? localToInstant(`${t.endDate} 00:00`, place.tz)! : localToInstant(`${t.startDate} 23:59`, place.tz)!;
  const checkedAt = new Date().toISOString();
  return {
    supplierKey: "travelshop", kind: "activity", externalId: `${t.ref}|${adults}|${children}`, title: t.title,
    start: { at: start, timezone: place.tz, place: destIata, lat: place.lat, lng: place.lng },
    end: { at: end, timezone: place.tz, place: destIata, lat: place.lat, lng: place.lng },
    net: { amount: q.retailTotal, currency: q.currency }, refundable: false, observedAt: checkedAt,
  };
}

// ---------------------------------------------------------------- cruises (production live feed)
/**
 * Live cruise voyages embarking at the destination within the trip window.
 * Scheduled in the Trip Graph only when the supplier publishes the embark
 * departure time and the embark port is the destination city (known time zone).
 */
export async function searchCruisesCanonical(destIata: string, from: string, to: string, currency: string) {
  const reg = registrationFor("crystal");
  if (!supports(reg, "search")) return { offers: [] as CanonicalOffer[], unscheduled: 0, error: "Cruise search not registered" };
  const place = airportTz(destIata);
  const { findAirportByCode } = await import("@/lib/aviation/airports.server");
  const city = (findAirportByCode(destIata)?.city ?? "").toLowerCase();
  const { fetchAktgVoyages } = await import("@/lib/crystal/aktg.server");
  const feed = await fetchAktgVoyages(currency);
  const inWindow = feed.voyages.filter((v) => v.dataSource === "licensed" && v.departureDate >= from && v.departureDate <= to && city && v.embarkPort.toLowerCase().includes(city));
  const offers: CanonicalOffer[] = [];
  let unscheduled = 0;
  for (const v of inWindow) {
    const first = v.itinerary[0], last = v.itinerary[v.itinerary.length - 1];
    const fare = v.fares.filter((f) => f.price > 0).sort((a, b) => a.price - b.price)[0];
    if (!place || !first?.depart || !fare) { unscheduled++; continue; }
    const s = localToInstant(`${v.departureDate} ${first.depart}`, place.tz);
    const endLocal = last?.arrive ? `${v.returnDate} ${last.arrive}` : null;
    if (!s || !endLocal) { unscheduled++; continue; }
    // Disembark port time zone is only known when it is the same city.
    const e = v.disembarkPort === v.embarkPort ? localToInstant(endLocal, place.tz) : null;
    if (!e) { unscheduled++; continue; }
    offers.push({
      supplierKey: "crystal", kind: "cruise", externalId: `${v.code}:${fare.gradeId ?? fare.suiteCategory}`,
      title: `${v.nights}-night voyage from ${v.embarkPort}`,
      start: { at: s, timezone: place.tz, place: destIata }, end: { at: e, timezone: place.tz, place: destIata },
      net: { amount: fare.price, currency: v.currency }, refundable: false, observedAt: feed.fetchedAt,
    });
  }
  return { offers, unscheduled, error: feed.error ?? null };
}
