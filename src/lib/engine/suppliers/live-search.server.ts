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
import type { WorldwayFlightOffer } from "@/lib/flights/flight-adapters.server";

function flightSupplier(offerId: string): string | null {
  if (offerId.startsWith("WWF-A-")) return "up17";
  if (offerId.startsWith("WWF-B-")) return "airiq";
  return null;
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
    net: { amount: o.total_price, currency: o.currency }, refundable: o.refundable === true,
  };
}

export async function searchFlightsCanonical(origin: string, destination: string, date: string, passengers: number, cabin: "economy" | "business") {
  const { searchFlightsViaEngine } = await import("@/lib/flights/flight-adapters.server");
  const r = await searchFlightsViaEngine({ origin, destination, depart_date: date, passengers, cabin });
  const offers = ((r as { offers?: WorldwayFlightOffer[] }).offers ?? []).map(flightToCanonical).filter((x): x is CanonicalOffer => !!x);
  return { offers, error: offers.length ? null : ((r as { error?: string }).error ?? "No live flights found"), query: (r as { query?: { origin: string; destination: string } }).query };
}

// ---------------------------------------------------------------- hotels
export async function searchHotelsCanonical(cityIata: string, checkin: string, checkout: string, adults: number, currency: string) {
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
      net: { amount: rate.price.amount!, currency: rate.price.currency! }, refundable: rate.refundable === true,
    });
  }
  return { offers: offers.sort((a, b) => a.net.amount - b.net.amount).slice(0, 5), error: offers.length ? null : "No live hotel availability" };
}

// ---------------------------------------------------------------- activities (on request)
export interface OnRequestItem { kind: string; title: string; reason: string; indicativeFrom: { amount: number; currency: string } | null; ref: string }

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
