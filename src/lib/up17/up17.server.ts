// UP17 Communication Pvt Ltd travel API (flights / hotels / buses).
// Docs: https://travelapi.up17.in/up17_api.html — Basic-style header auth.

import { AIRPORT_ROWS } from "./airports.data.server";
import { searchUp17Cities, findUp17CityByName, type Up17City } from "./cities.db.server";

const BASE = "https://travelapi.up17.in/api";

export type Up17Result<T = unknown> = {
  ok: boolean;
  status: number;
  error?: string;
  data?: T;
};

export function up17Headers(): Record<string, string> | null {
  const username = process.env["UP17_USERNAME"];
  const password = process.env["UP17_PASSWORD"];
  if (!username || !password) return null;
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Username: username,
    Password: password,
  };
}

export function up17Configured(): boolean {
  return up17Headers() !== null;
}

// UP17 binds every SearchTokenId to the IP that issued it, so follow-up calls
// (fare confirmation, SSR, fare rules, book) must reuse the server's real
// egress IP. Sending a placeholder makes UP17 reply "Invalid search token".
let egressIp: string | null = null;
let egressIpAt = 0;

export async function up17ServerIp(): Promise<string> {
  const fresh = Date.now() - egressIpAt < 30 * 60 * 1000;
  if (egressIp && fresh) return egressIp;
  try {
    const res = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(4000) });
    const text = (await res.text()).trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
      egressIp = text;
      egressIpAt = Date.now();
      return text;
    }
  } catch {
    // fall through to the previous value / placeholder
  }
  return egressIp ?? "1.1.1.1";
}

async function callUp17<T>(path: string, payload: unknown): Promise<Up17Result<T>> {
  const headers = up17Headers();
  if (!headers) {
    return { ok: false, status: 503, error: "UP17 API credentials are not configured" };
  }
  try {
    const body =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? { ...(payload as Rec), UserIp: await up17ServerIp() }
        : (payload ?? {});
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const err = rec["Error"] as { ErrorCode?: number; ErrorMessage?: string } | undefined;
    if (!res.ok || (err && err.ErrorCode && err.ErrorCode !== 0)) {
      const message = err?.ErrorMessage ?? `UP17 request failed (${res.status})`;
      console.error("UP17 request failed", { path, status: res.status, message });
      return { ok: false, status: res.status || 502, error: message, data: data as T };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    console.error("UP17 network error", { path, message });
    return { ok: false, status: 0, error: message };
  }
}

// ---------------------------------------------------------------- airports

export type AirportRow = {
  iata: string;
  city: string;
  country: string;
  name: string;
};

let airportIndex: AirportRow[] | null = null;

function airports(): AirportRow[] {
  if (airportIndex) return airportIndex;
  airportIndex = AIRPORT_ROWS.trim()
    .split("\n")
    .map((line) => {
      const [iata, city, country, name] = line.split("|");
      return { iata, city, country, name: name ?? "" };
    })
    .filter((a) => a.iata && a.city);
  return airportIndex;
}

const PRIORITY = new Set([
  "DEL",
  "BOM",
  "BLR",
  "MAA",
  "CCU",
  "HYD",
  "GOI",
  "COK",
  "AMD",
  "PNQ",
  "DXB",
  "LHR",
  "JFK",
  "SIN",
  "YYZ",
  "CDG",
  "FRA",
  "SYD",
  "HKG",
  "DOH",
]);

export function searchAirports(query: string, limit = 12): AirportRow[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { row: AirportRow; score: number }[] = [];
  for (const row of airports()) {
    const iata = row.iata.toLowerCase();
    const city = row.city.toLowerCase();
    const country = row.country.toLowerCase();
    const name = row.name.toLowerCase();
    let score = -1;
    if (iata === q) score = 0;
    else if (city === q) score = 1;
    else if (city.startsWith(q)) score = 2;
    else if (iata.startsWith(q)) score = 3;
    else if (name.startsWith(q)) score = 4;
    else if (city.includes(q)) score = 5;
    else if (name.includes(q)) score = 6;
    else if (country.startsWith(q)) score = 7;
    if (score < 0) continue;
    if (PRIORITY.has(row.iata)) score -= 0.5;
    scored.push({ row, score });
    if (scored.length > 4000) break;
  }
  scored.sort((a, b) => a.score - b.score || a.row.city.localeCompare(b.row.city));
  return scored.slice(0, limit).map((s) => s.row);
}

// ---------------------------------------------------------------- flights

export type Up17FlightSegment = {
  airline: string;
  airlineCode: string;
  flightNumber: string;
  fareClass: string;
  craft: string;
  origin: string;
  originCity: string;
  originTerminal: string;
  destination: string;
  destinationCity: string;
  destinationTerminal: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  layoverMin: number | null;
  tripIndex: number;
};

export type Up17Fare = {
  currency: string;
  total: number | null;
  base: number | null;
  tax: number | null;
  published: number | null;
  offered: number | null;
};

/** One bookable fare family attached to an itinerary. */
export type Up17FareOption = {
  fareId: string;
  fareType: string;
  fareName: string;
  source: string;
  cabinClass: string;
  refundable: boolean | null;
  inclusions: string[];
  airlineRemark: string;
  checkInBaggage: string | null;
  cabinBaggage: string | null;
  seatsAvailable: number | null;
  fare: Up17Fare;
};

export type Up17FlightOffer = {
  recommendedRank: number;
  resultIndex: string;
  airline: string;
  airlineCode: string;
  airlineLogo: string;
  flightNumbers: string[];
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  stops: number;
  stopAirports: string[];
  durationMin: number | null;
  refundable: boolean | null;
  cabinClass: string;
  fareType: string;
  source: string;
  checkInBaggage: string | null;
  cabinBaggage: string | null;
  seatsAvailable: number | null;
  fare: Up17Fare;
  fares: Up17FareOption[];
  segments: Up17FlightSegment[];
  baggageOptions: Up17BaggageOption[];
};

export type Up17BaggageOption = {
  tier: number;
  code: string;
  label: string;
  weightKg: number | null;
  price: number | null;
  currency: string;
};

type Rec = Record<string, unknown>;

const asRec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;

function pick(rec: Rec, keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k];
    const found = Object.keys(rec).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (found && rec[found] !== undefined && rec[found] !== null) return rec[found];
  }
  return undefined;
}

/** Airline logo CDN — 100x40 PNG keyed on the 2-letter IATA carrier code. */
export function airlineLogoUrl(code: string): string {
  const c = code.trim().toUpperCase();
  return c ? `https://pics.avs.io/120/48/${c}.png` : "";
}

function normalizeSegment(raw: Rec, tripIndex: number): Up17FlightSegment {
  const airlineRec = asRec(pick(raw, ["Airline", "airline"]));
  const originRec = asRec(pick(raw, ["Origin", "origin"]));
  const destRec = asRec(pick(raw, ["Destination", "destination"]));
  return {
    airline: str(pick(airlineRec, ["AirlineName", "Name"])) || str(pick(raw, ["AirlineName"])),
    airlineCode: str(pick(airlineRec, ["AirlineCode", "Code"])) || str(pick(raw, ["AirlineCode"])),
    flightNumber:
      str(pick(airlineRec, ["FlightNumber"])) || str(pick(raw, ["FlightNumber", "flightNumber"])),
    fareClass: str(pick(airlineRec, ["FareClass", "BookingClass"])),
    craft: str(pick(raw, ["Craft", "craft", "Equipment"])),
    origin: str(pick(originRec, ["AirportCode", "Code"])) || str(pick(raw, ["Origin"])),
    originCity: str(pick(originRec, ["CityName", "City"])),
    originTerminal: str(pick(originRec, ["Terminal"])),
    destination: str(pick(destRec, ["AirportCode", "Code"])) || str(pick(raw, ["Destination"])),
    destinationCity: str(pick(destRec, ["CityName", "City"])),
    destinationTerminal: str(pick(destRec, ["Terminal"])),
    departure: str(pick(originRec, ["DepartTime", "DepTime", "DepartureTime"])) || null,
    arrival: str(pick(destRec, ["ArrivalTime", "ArrTime"])) || null,
    durationMin: num(pick(raw, ["Duration", "duration"])),
    layoverMin: num(pick(raw, ["LayoverTime", "layoverTime"])),
    tripIndex,
  };
}

function baggageStrings(fare: Rec): { checkIn: string | null; cabin: string | null; seats: number | null } {
  const raw = pick(fare, ["SeatBaggage", "seatBaggage"]);
  const flat: Rec[] = Array.isArray(raw)
    ? (raw.flatMap((v) => (Array.isArray(v) ? v : [v])).filter(Boolean) as Rec[])
    : [];
  const checkIn = flat.map((r) => str(pick(r, ["CheckIn", "Baggage"]))).filter(Boolean);
  const cabin = flat.map((r) => str(pick(r, ["Cabin", "CabinBaggage"]))).filter(Boolean);
  const seats = flat
    .map((r) => num(pick(r, ["NoOfSeatAvailable", "SeatsAvailable"])))
    .filter((v): v is number => v !== null);
  return {
    checkIn: checkIn.length ? [...new Set(checkIn)].join(" / ") : null,
    cabin: cabin.length ? [...new Set(cabin)].join(" / ") : null,
    seats: seats.length ? Math.min(...seats) : null,
  };
}

function normalizeFareOption(raw: Rec): Up17FareOption {
  const fareRec = asRec(pick(raw, ["Fare", "fare"]));
  const bags = baggageStrings(raw);
  const published = num(pick(fareRec, ["PublishedPrice", "PublishedFare"])) ?? num(pick(raw, ["PublishedPrice"]));
  const offered = num(pick(fareRec, ["OfferedPrice", "OfferedFare"])) ?? num(pick(raw, ["OfferedPrice"]));
  const base = num(pick(fareRec, ["BaseFare", "Base"]));
  const tax = num(pick(fareRec, ["Tax", "TotalTax"]));
  const inclusionsRaw = pick(raw, ["FareInclusions", "fareInclusions"]);
  return {
    fareId: str(pick(raw, ["FareId", "ResultIndex", "fareId"])),
    fareType: str(pick(raw, ["FareType", "fareType"])),
    fareName: str(pick(raw, ["FareName", "FareType"])),
    source: str(pick(raw, ["Source", "source"])),
    cabinClass: str(pick(raw, ["CabinClass", "cabinClass"])),
    refundable:
      typeof pick(raw, ["IsRefundable", "isRefundable"]) === "boolean"
        ? (pick(raw, ["IsRefundable"]) as boolean)
        : null,
    inclusions: Array.isArray(inclusionsRaw)
      ? inclusionsRaw.filter((v): v is string => typeof v === "string")
      : [],
    airlineRemark: str(pick(raw, ["AirlineRemark", "airlineRemark"])),
    checkInBaggage: bags.checkIn,
    cabinBaggage: bags.cabin,
    seatsAvailable: bags.seats,
    fare: {
      currency: str(pick(fareRec, ["Currency", "CurrencyCode"])) || "INR",
      total: offered ?? published ?? (base !== null ? base + (tax ?? 0) : null),
      base,
      tax,
      published,
      offered,
    },
  };
}

function normalizeItinerary(raw: Rec): Up17FlightOffer | null {
  const segmentsRaw = pick(raw, ["Segments", "segments"]);
  const groups: Rec[][] = Array.isArray(segmentsRaw)
    ? segmentsRaw.map((g) => (Array.isArray(g) ? (g as Rec[]) : [g as Rec]))
    : [];
  const segments = groups.flatMap((group, tripIndex) =>
    group.filter(Boolean).map((s) => normalizeSegment(asRec(s), tripIndex)),
  );
  if (!segments.length) return null;

  const fareListRaw = pick(raw, ["FareList", "fareList", "Fares"]);
  const fares = (Array.isArray(fareListRaw) ? (fareListRaw as Rec[]) : [])
    .map(normalizeFareOption)
    .filter((f) => f.fareId || f.fare.total !== null)
    .sort((a, b) => (a.fare.total ?? Infinity) - (b.fare.total ?? Infinity));

  const cheapest = fares[0];
  const first = segments[0];
  const last = segments[segments.length - 1];
  const tripCount = Math.max(1, groups.length);
  const minPublished = num(pick(raw, ["MinPublishedPrice", "MinPublishedFare"]));

  return {
    recommendedRank: 0,
    resultIndex: cheapest?.fareId ?? "",
    airline: first.airline,
    airlineCode: first.airlineCode,
    airlineLogo: airlineLogoUrl(first.airlineCode),
    flightNumbers: segments
      .map((s) => `${s.airlineCode}${s.flightNumber}`.trim())
      .filter((v) => v.length > 1),
    origin: first.origin,
    destination: last.destination,
    departure: first.departure,
    arrival: last.arrival,
    stops: Math.max(segments.length - tripCount, 0),
    stopAirports: segments.slice(0, -1).map((s) => s.destination).filter(Boolean),
    durationMin: segments.reduce<number | null>(
      (acc, s) => (s.durationMin === null ? acc : (acc ?? 0) + s.durationMin),
      null,
    ),
    refundable: cheapest?.refundable ?? null,
    cabinClass: cheapest?.cabinClass ?? "",
    fareType: cheapest?.fareType ?? "",
    source: cheapest?.source ?? "",
    checkInBaggage: cheapest?.checkInBaggage ?? null,
    cabinBaggage: cheapest?.cabinBaggage ?? null,
    seatsAvailable: cheapest?.seatsAvailable ?? null,
    fare: cheapest?.fare ?? {
      currency: "INR",
      total: minPublished,
      base: null,
      tax: null,
      published: minPublished,
      offered: minPublished,
    },
    fares,
    segments,
    baggageOptions: [],
  };
}

/** UP17 returns `Result` as an array of journey buckets, each holding itineraries. */
function collectItineraries(data: unknown): Rec[] {
  const root = asRec(data);
  const result = pick(root, ["Result", "result", "Results"]);
  if (!Array.isArray(result)) return [];
  return result
    .flatMap((bucket) => (Array.isArray(bucket) ? bucket : [bucket]))
    .filter((v): v is Rec => Boolean(v) && typeof v === "object");
}

/** Recommendation score: cheapest + fastest + fewest stops wins rank #1. */
function rankOffers(offers: Up17FlightOffer[]): Up17FlightOffer[] {
  const fares = offers.map((o) => o.fare.total ?? Number.POSITIVE_INFINITY);
  const durations = offers.map((o) => o.durationMin ?? Number.POSITIVE_INFINITY);
  const minFare = Math.min(...fares.filter(Number.isFinite), Number.POSITIVE_INFINITY);
  const minDur = Math.min(...durations.filter(Number.isFinite), Number.POSITIVE_INFINITY);
  const fareBase = Number.isFinite(minFare) ? minFare : 1;
  const durBase = Number.isFinite(minDur) ? minDur : 1;
  const scored = offers.map((o) => {
    const fare = o.fare.total ?? fareBase * 3;
    const dur = o.durationMin ?? durBase * 3;
    const score = (fare / fareBase) * 0.6 + (dur / durBase) * 0.3 + o.stops * 0.1;
    return { o, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s, i) => ({ ...s.o, recommendedRank: i + 1 }));
}

function normalizeBaggage(data: unknown, currency: string): Up17BaggageOption[] {
  const found: Up17BaggageOption[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    const rec = value as Rec;
    const weightRaw = pick(rec, ["Weight", "weight"]);
    const code = str(pick(rec, ["Code", "code", "SSRCode", "BaggageCode"]));
    const desc = str(pick(rec, ["Description", "description", "Text", "AirlineDescription"]));
    const weight = num(weightRaw) ?? num((/(\d+)\s*kg/i.exec(desc) ?? [])[1]);
    const isBaggage = weight !== null || /bag/i.test(desc) || /BAG|XB/i.test(code);
    if (isBaggage && (code || desc)) {
      found.push({
        tier: 0,
        code: code || desc,
        label: weight !== null ? `${weight} KG checked baggage` : desc,
        weightKg: weight,
        price: num(pick(rec, ["Price", "price", "Amount", "Fare"])),
        currency: str(pick(rec, ["Currency", "CurrencyCode"])) || currency,
      });
    }
    Object.values(rec).forEach((v) => walk(v, depth + 1));
  };
  walk(data);
  const unique = new Map<string, Up17BaggageOption>();
  for (const o of found) if (!unique.has(o.code)) unique.set(o.code, o);
  const list = [...unique.values()]
    .filter((o) => o.weightKg !== null)
    .sort((a, b) => (a.weightKg ?? 0) - (b.weightKg ?? 0) || (a.price ?? 0) - (b.price ?? 0))
    .slice(0, 8)
    .map((o, i) => ({ ...o, tier: i + 1 }));
  return list;
}

export type Up17SearchInput = {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string;
  passengers?: number;
  children?: number;
  infants?: number;
  cabin?: "economy" | "premium_economy" | "business" | "first";
  trip_type?: "one_way" | "round_trip" | "multi_city";
  direct_only?: boolean;
  preferred_carriers?: string[];
  legs?: { origin: string; destination: string; date: string }[];
  user_ip?: string;
};

const CABIN_MAP: Record<string, number> = {
  economy: 1,
  premium_economy: 2,
  business: 3,
  first: 4,
};

export function toUp17SearchPayload(input: Up17SearchInput) {
  const journeyType =
    input.trip_type === "round_trip" ? 2 : input.trip_type === "multi_city" ? 3 : 1;
  const iso = (d: string) => `${d}T00:00:00`;
  const segments =
    journeyType === 3 && input.legs?.length
      ? input.legs.map((l) => ({
          Origin: l.origin.toUpperCase(),
          Destination: l.destination.toUpperCase(),
          PreferredTime: iso(l.date),
        }))
      : [
          {
            Origin: input.origin.toUpperCase(),
            Destination: input.destination.toUpperCase(),
            PreferredTime: iso(input.depart_date),
          },
          ...(journeyType === 2 && input.return_date
            ? [
                {
                  Origin: input.destination.toUpperCase(),
                  Destination: input.origin.toUpperCase(),
                  PreferredTime: iso(input.return_date),
                },
              ]
            : []),
        ];
  return {
    UserIp: input.user_ip ?? "1.1.1.1",
    Adult: input.passengers ?? 1,
    Child: input.children ?? 0,
    Infant: input.infants ?? 0,
    DirectFlight: input.direct_only ?? false,
    JourneyType: journeyType,
    PreferredCarriers: (input.preferred_carriers ?? []).map((c) => c.toUpperCase()),
    CabinClass: CABIN_MAP[input.cabin ?? "economy"] ?? 1,
    AirSegments: segments,
    Sources: null,
  };
}

export type Up17FlightSearchResponse = {
  searchTokenId: string | null;
  offers: Up17FlightOffer[];
  count: number;
};

export async function up17SearchFlights(
  input: Up17SearchInput,
): Promise<Up17Result<Up17FlightSearchResponse>> {
  const res = await callUp17<unknown>("/airservice/rest/search", toUp17SearchPayload(input));
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const root = asRec(res.data);
  const token = str(pick(root, ["SearchTokenId"])) || null;
  const itineraries = collectItineraries(res.data);
  const normalized = itineraries
    .map(normalizeItinerary)
    .filter((o): o is Up17FlightOffer => o !== null);
  const offers = rankOffers(normalized);
  return {
    ok: true,
    status: res.status,
    data: { searchTokenId: token, offers, count: offers.length },
  };
}

export async function up17BaggageOptions(args: {
  resultIndex: string;
  searchTokenId: string;
  currency?: string;
  user_ip?: string;
}): Promise<Up17Result<{ options: Up17BaggageOption[] }>> {
  const res = await callUp17<unknown>("/airservice/rest/ssr", {
    UserIp: args.user_ip ?? "1.1.1.1",
    ResultIndex: args.resultIndex,
    SearchTokenId: args.searchTokenId,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error, data: { options: [] } };
  return {
    ok: true,
    status: res.status,
    data: { options: normalizeBaggage(res.data, args.currency ?? "INR") },
  };
}

export async function up17FareRules(args: {
  resultIndex: string;
  searchTokenId: string;
  user_ip?: string;
}): Promise<Up17Result<{ rules: { title: string; text: string }[] }>> {
  const res = await callUp17<unknown>("/airservice/rest/farerule", {
    UserIp: args.user_ip ?? "1.1.1.1",
    ResultIndex: args.resultIndex,
    SearchTokenId: args.searchTokenId,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const rules: { title: string; text: string }[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    const rec = value as Rec;
    const text = str(pick(rec, ["FareRuleDetail", "FareRuleText", "Detail", "Text"]));
    if (text) {
      rules.push({
        title:
          str(pick(rec, ["Airline", "Origin"])) && str(pick(rec, ["Destination"]))
            ? `${str(pick(rec, ["Origin"]))} → ${str(pick(rec, ["Destination"]))}`
            : "Fare rules",
        text,
      });
    }
    Object.values(rec).forEach((v) => walk(v, depth + 1));
  };
  walk(res.data);
  return { ok: true, status: res.status, data: { rules } };
}

// ---------------------------------------------------------------- hotels

export type Up17HotelRoom = {
  roomType: string;
  boardBasis: string;
  refundable: boolean;
  price: number | null;
  currency: string;
};

export type Up17Hotel = {
  resultIndex: string;
  hotelCode: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  category: string;
  address: string;
  description: string;
  image: string;
  gallery: string[];
  amenities: string[];
  latitude: number | null;
  longitude: number | null;
  supplier: string;
  contact: string;
  promotion: string;
  hotDeal: boolean;
  currency: string;
  totalPrice: number | null;
  roomPrice: number | null;
  tax: number | null;
  rooms: Up17HotelRoom[];
};

export type Up17HotelSearchInput = {
  destination: string; // free text; resolved via the UP17 city master
  check_in: string;
  check_out: string;
  guests?: number;
  rooms?: number;
  nationality?: string;
  min_rating?: number;
  max_rating?: number;
  user_ip?: string;
};

export type Up17HotelSearchResponse = {
  searchTokenId: string | null;
  cityId: string;
  cityName: string;
  hotels: Up17Hotel[];
  count: number;
};

/** Strip supplier HTML down to a short plain-text teaser. */
function plainText(html: string, max = 320): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function imageList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => str(v)).filter((v) => /^https?:\/\//.test(v));
  }
  const single = str(value);
  return /^https?:\/\//.test(single) ? [single] : [];
}

function normalizeHotel(raw: Rec): Up17Hotel {
  const rec = asRec(raw);
  const price = asRec(pick(rec, ["Price", "Fare", "price", "fare"]));
  const roomsRaw = pick(rec, ["Rooms", "rooms", "HotelRoomsDetails"]);
  const rooms: Up17HotelRoom[] = Array.isArray(roomsRaw)
    ? (roomsRaw as Rec[]).map((r) => {
        const roomPrice = asRec(pick(r, ["Price", "Fare", "price"]));
        return {
          roomType: str(pick(r, ["RoomTypeName", "RoomType", "roomType"])),
          boardBasis: str(pick(r, ["Inclusion", "BoardBasis", "boardBasis", "BoardType"])),
          refundable: Boolean(pick(r, ["IsRefundable", "isRefundable"])),
          price:
            num(pick(roomPrice, ["OfferedPrice", "PublishedPrice", "RoomPrice"])) ??
            num(pick(r, ["OfferedPrice", "PublishedPrice"])),
          currency: str(pick(roomPrice, ["CurrencyCode", "Currency"])) || "INR",
        };
      })
    : [];
  const gallery = [
    ...imageList(pick(rec, ["HotelPicture", "HotelImage", "Image", "ImageUrl"])),
    ...imageList(pick(rec, ["Images", "HotelPictures", "Gallery"])),
  ];
  const amenitiesRaw = pick(rec, ["HotelFacilities", "Amenities", "Facilities"]);
  return {
    resultIndex: str(pick(rec, ["ResultIndex", "resultIndex"])),
    hotelCode: str(pick(rec, ["HotelCode", "hotelCode"])),
    name: str(pick(rec, ["HotelName", "hotelName", "Name"])),
    city: str(pick(rec, ["HotelLocation", "CityName", "cityName", "City"])),
    country: str(pick(rec, ["CountryName", "countryName", "Country"])),
    starRating: num(pick(rec, ["StarRating", "starRating"])) ?? 0,
    category: str(pick(rec, ["HotelCategory", "category", "StarRatingText"])),
    address: str(pick(rec, ["HotelAddress", "Address", "address"])),
    description: plainText(str(pick(rec, ["HotelDescription", "description", "Description"]))),
    image: gallery[0] ?? "",
    gallery: [...new Set(gallery)].slice(0, 8),
    amenities: Array.isArray(amenitiesRaw)
      ? amenitiesRaw.map((a) => str(a)).filter(Boolean).slice(0, 12)
      : [],
    latitude: num(pick(rec, ["Latitude", "latitude"])),
    longitude: num(pick(rec, ["Longitude", "longitude"])),
    supplier: str(pick(rec, ["Supplier", "supplier"])),
    contact: str(pick(rec, ["HotelContactNo", "ContactNo"])),
    promotion: str(pick(rec, ["HotelPromotion", "Promotion"])),
    hotDeal: Boolean(pick(rec, ["IsHotDeal", "isHotDeal"])),
    currency: str(pick(price, ["CurrencyCode", "Currency"])) || "INR",
    totalPrice:
      num(pick(price, ["OfferedPrice", "PublishedPrice", "TotalFare"])) ??
      num(pick(rec, ["OfferedPrice", "PublishedPrice", "MinPublishedPrice"])),
    roomPrice: num(pick(price, ["RoomPrice", "BaseFare"])),
    tax: num(pick(price, ["Tax", "TotalTax"])),
    rooms,
  };
}

export async function up17SearchHotels(
  input: Up17HotelSearchInput,
): Promise<Up17Result<Up17HotelSearchResponse>> {
  const city = await findUp17CityByName(input.destination, "hotel");
  if (!city) {
    return {
      ok: false,
      status: 422,
      error: `No UP17 hotel destination matches "${input.destination}". Try a nearby city or pick a suggestion from the list.`,
    };
  }
  const checkIn = input.check_in;
  const checkOut = input.check_out;
  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const rooms = input.rooms ?? 1;
  const guests = input.guests ?? 2;
  const adults = Math.max(1, Math.ceil(guests / rooms));
  const roomGuests = Array.from({ length: rooms }, () => ({
    Adult: adults,
    Child: 0,
    ChildAge: [] as number[],
  }));
  const payload = {
    UserIp: input.user_ip ?? "1.1.1.1",
    CountryCode: city.countryCode,
    CheckInDate: checkIn,
    CheckOutDate: checkOut,
    NoOfNights: nights,
    DestinationCityId: city.cityId,
    // UP17 is an India-based consolidator: rates are contracted against an
    // Indian guest nationality. Passing the destination country here returns
    // "no result found" for most international cities (e.g. Dubai/AE).
    GuestNationality: input.nationality ?? "IN",

    NoOfRooms: rooms,
    MinRating: input.min_rating ?? 1,
    MaxRating: input.max_rating ?? 5,
    RoomGuests: roomGuests,
  };
  const res = await callUp17<unknown>("/hotelservice/rest/search", payload);
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const root = asRec(res.data);
  const token = str(pick(root, ["SearchTokenId"])) || null;
  const result = pick(root, ["Result", "result", "Results", "results"]);
  const rawHotels = Array.isArray(result) ? (result as Rec[]) : [];
  const hotels = rawHotels
    .map(normalizeHotel)
    .sort((a, b) => (a.totalPrice ?? Infinity) - (b.totalPrice ?? Infinity));
  return {
    ok: true,
    status: res.status,
    data: {
      searchTokenId: token,
      cityId: city.cityId,
      cityName: `${city.city}${city.country ? `, ${city.country}` : ""}`,
      hotels,
      count: hotels.length,
    },
  };
}

export type Up17HotelDetail = {
  gallery: string[];
  amenities: string[];
  description: string;
  address: string;
  checkInTime: string;
  checkOutTime: string;
};

export async function up17HotelDetail(args: {
  resultIndex: string;
  hotelCode: string;
  searchTokenId: string;
  user_ip?: string;
}): Promise<Up17Result<Up17HotelDetail>> {
  const res = await callUp17<unknown>("/hotelservice/rest/gethotelinfo", {
    UserIp: args.user_ip ?? "1.1.1.1",
    ResultIndex: args.resultIndex,
    HotelCode: args.hotelCode,
    SearchTokenId: args.searchTokenId,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const root = asRec(res.data);
  const detail = asRec(pick(root, ["HotelDetails", "HotelInfoResult", "Result"]));
  const info = asRec(pick(detail, ["HotelDetails", "HotelInfo"])) ;
  const source = Object.keys(info).length ? info : detail;
  const facilities = pick(source, ["HotelFacilities", "Amenities", "Facilities"]);
  const images = pick(source, ["Images", "HotelPicture", "HotelPictures"]);
  return {
    ok: true,
    status: res.status,
    data: {
      gallery: imageList(images).slice(0, 12),
      amenities: Array.isArray(facilities)
        ? facilities.map((f) => str(f)).filter(Boolean).slice(0, 24)
        : [],
      description: plainText(str(pick(source, ["Description", "HotelDescription"])), 900),
      address: str(pick(source, ["Address", "HotelAddress"])),
      checkInTime: str(pick(source, ["HotelCheckInTime", "CheckInTime"])),
      checkOutTime: str(pick(source, ["HotelCheckOutTime", "CheckOutTime"])),
    },
  };
}

export async function up17CityAutocomplete(
  query: string,
  limit = 12,
  kind: "hotel" | "bus" = "hotel",
): Promise<{ ok: true; results: Up17City[] }> {
  return { ok: true, results: await searchUp17Cities(query, limit, kind) };
}

// ---------------------------------------------------------------- buses

export type Up17BusSegment = {
  operator: string;
  busType: string;
  vehicleNumber?: string;
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  seatsAvailable: number | null;
  amenities: string[];
};

export type Up17BusPoint = {
  name: string;
  location: string;
  time: string | null;
};

export type Up17BusCancellationRule = {
  policy: string;
  charge: number | null;
  /** 1 = flat amount, 2 = percentage of fare (UP17 convention). */
  chargeType: number | null;
};

export type Up17BusOffer = {
  resultIndex: string;
  operator: string;
  serviceName: string;
  busType: string;
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  price: number | null;
  basePrice: number | null;
  tax: number | null;
  currency: string;
  seatsAvailable: number | null;
  maxSeatsPerTicket: number | null;
  refundable: boolean;
  amenities: string[];
  boardingPoints: Up17BusPoint[];
  droppingPoints: Up17BusPoint[];
  cancellationPolicies: Up17BusCancellationRule[];
  segments: Up17BusSegment[];
};

export type Up17BusSearchInput = {
  origin: string;
  destination: string;
  date: string;
  passengers?: number;
  user_ip?: string;
};

export type Up17BusSearchResponse = {
  searchTokenId: string | null;
  buses: Up17BusOffer[];
  count: number;
};

function normalizeBus(raw: Rec): Up17BusOffer {
  const rec = asRec(raw);
  // UP17 bus search returns a flat record: TravelName / BusType / DepartureTime /
  // ArrivalTime / AvailableSeats / BusPrice{...} plus boarding & dropping points.
  const fare = asRec(pick(rec, ["BusPrice", "Fare", "fare"]));
  const boarding = pick(rec, ["BoardingPointsDetails"]);
  const dropping = pick(rec, ["DroppingPointsDetails"]);
  const boardRows = Array.isArray(boarding) ? (boarding as Rec[]) : [];
  const dropRows = Array.isArray(dropping) ? (dropping as Rec[]) : [];
  const departure =
    str(pick(rec, ["DepartureTime", "DepTime"])) ||
    str(pick(boardRows[0] ?? {}, ["CityPointTime"])) ||
    "";
  const arrival =
    str(pick(rec, ["ArrivalTime", "ArrTime"])) ||
    str(pick(dropRows[dropRows.length - 1] ?? {}, ["CityPointTime"])) ||
    "";
  const depMs = departure ? new Date(departure).getTime() : NaN;
  const arrMs = arrival ? new Date(arrival).getTime() : NaN;
  const durationMin =
    Number.isFinite(depMs) && Number.isFinite(arrMs) && arrMs > depMs
      ? Math.round((arrMs - depMs) / 60000)
      : num(pick(rec, ["Duration", "duration"]));
  const segments: Up17BusSegment[] = boardRows.length
    ? [
        {
          operator: str(pick(rec, ["TravelName", "TravelsName", "Operator"])),
          busType: str(pick(rec, ["BusType", "busType"])),
          origin: str(pick(boardRows[0], ["CityPointName"])),
          destination: str(pick(dropRows[dropRows.length - 1] ?? {}, ["CityPointName"])),
          departure: departure || null,
          arrival: arrival || null,
          durationMin,
          seatsAvailable: num(pick(rec, ["AvailableSeats"])),
          amenities: [],
        },
      ]
    : [];
  const amenities = [
    pick(rec, ["LiveTrackingAvailable"]) ? "Live tracking" : "",
    pick(rec, ["MTicketEnabled"]) ? "M-ticket" : "",
    pick(rec, ["IdProofRequired"]) ? "ID proof required" : "",
    pick(rec, ["PartialCancellationAllowed"]) ? "Partial cancellation" : "",
    str(pick(rec, ["ServiceName"])),
  ].filter(Boolean);
  const policies = pick(rec, ["CancellationPolicies"]);
  const policyRows = Array.isArray(policies) ? (policies as Rec[]) : [];
  const toPoints = (rows: Rec[]): Up17BusPoint[] =>
    rows.map((r) => ({
      name: str(pick(r, ["CityPointName"])),
      location: str(pick(r, ["CityPointLocation"])),
      time: str(pick(r, ["CityPointTime"])) || null,
    }));
  return {
    resultIndex: str(pick(rec, ["ResultIndex", "resultIndex"])),
    operator: str(pick(rec, ["TravelName", "TravelsName", "Operator", "operator"])),
    serviceName: str(pick(rec, ["ServiceName"])),
    busType: str(pick(rec, ["BusType", "busType"])),
    origin: str(pick(boardRows[0] ?? {}, ["CityPointName"])),
    destination: str(pick(dropRows[dropRows.length - 1] ?? {}, ["CityPointName"])),
    departure: departure || null,
    arrival: arrival || null,
    durationMin,
    price:
      num(pick(fare, ["OfferedPrice", "PublishedPrice", "PublishedFare", "TotalFare", "Price"])) ??
      num(pick(fare, ["BasePrice"])),
    basePrice: num(pick(fare, ["BasePrice"])),
    tax: num(pick(fare, ["Tax"])),
    currency: str(pick(fare, ["Currency", "CurrencyCode"])) || "INR",
    seatsAvailable: num(pick(rec, ["AvailableSeats", "seatsAvailable", "Seats"])),
    maxSeatsPerTicket: num(pick(rec, ["MaxSeatsPerTicket"])),
    refundable: policyRows.length > 0 || Boolean(pick(rec, ["IsRefundable"])),
    amenities,
    boardingPoints: toPoints(boardRows),
    droppingPoints: toPoints(dropRows),
    cancellationPolicies: policyRows.map((r) => ({
      policy: str(pick(r, ["PolicyString"])),
      charge: num(pick(r, ["CancellationCharge"])),
      chargeType: num(pick(r, ["CancellationChargeType"])),
    })),
    segments,
  };
}


export async function up17SearchBuses(
  input: Up17BusSearchInput,
): Promise<Up17Result<Up17BusSearchResponse>> {
  const [originCity, destCity] = await Promise.all([
    findUp17CityByName(input.origin, "bus"),
    findUp17CityByName(input.destination, "bus"),
  ]);
  if (!originCity) {
    return {
      ok: false,
      status: 422,
      error: `No UP17 bus boarding city matches "${input.origin}". Pick a suggestion from the list.`,
    };
  }
  if (!destCity) {
    return {
      ok: false,
      status: 422,
      error: `No UP17 bus drop city matches "${input.destination}". Pick a suggestion from the list.`,
    };
  }
  const payload = {
    UserIp: input.user_ip ?? "1.1.1.1",
    OriginId: originCity.cityId,
    DestinationId: destCity.cityId,
    DateOfJourney: input.date,
  };
  const res = await callUp17<unknown>("/busservice/rest/search", payload);
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const root = asRec(res.data);
  const token = str(pick(root, ["SearchTokenId"])) || null;
  const result = pick(root, ["Result", "result", "Results", "results"]);
  const rawBuses = Array.isArray(result) ? (result as Rec[]) : [];
  const buses = rawBuses.map(normalizeBus);
  return { ok: true, status: res.status, data: { searchTokenId: token, buses, count: buses.length } };
}

// ---------------------------------------------------------- flight booking

export type Up17FareConfirmation = {
  priceChanged: boolean;
  isLcc: boolean;
  refundable: boolean | null;
  resultIndex: string;
  currency: string;
  total: number | null;
  base: number | null;
  tax: number | null;
  changeNote: string | null;
};

export async function up17ConfirmFare(args: {
  resultIndex: string;
  searchTokenId: string;
}): Promise<Up17Result<Up17FareConfirmation>> {
  const res = await callUp17<unknown>("/airservice/rest/fareconfirmation", {
    ResultIndex: args.resultIndex,
    SearchTokenId: args.searchTokenId,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const root = asRec(res.data);
  const result = asRec(pick(root, ["Result", "result"]));
  const fareRec = asRec(pick(result, ["Fare", "fare"]));
  const base = num(pick(fareRec, ["BaseFare", "Base"]));
  const tax = num(pick(fareRec, ["Tax", "TotalTax"]));
  const total =
    num(pick(fareRec, ["OfferedPrice", "PublishedPrice"])) ??
    (base !== null ? base + (tax ?? 0) : null);
  const changed = pick(root, ["IsPriceChanged"]);
  return {
    ok: true,
    status: res.status,
    data: {
      priceChanged: changed === true,
      isLcc: pick(result, ["IsLCC"]) === true,
      refundable:
        typeof pick(result, ["IsRefundable"]) === "boolean"
          ? (pick(result, ["IsRefundable"]) as boolean)
          : null,
      resultIndex: str(pick(result, ["ResultIndex"])) || args.resultIndex,
      currency: str(pick(fareRec, ["Currency", "CurrencyCode"])) || "INR",
      total,
      base,
      tax,
      changeNote: str(pick(root, ["FlightDetailChangeInfo"])) || null,
    },
  };
}

export type Up17Passenger = {
  title: string;
  first_name: string;
  last_name: string;
  pax_type: 1 | 2 | 3;
  date_of_birth: string;
  gender: 1 | 2;
  nationality: string;
  address_line1: string;
  city: string;
  country_code: string;
  contact_no: string;
  email: string;
  is_lead: boolean;
  passport_no?: string;
  passport_expiry?: string;
  passport_issue?: string;
  pan?: string;
  baggage_codes?: string[];
  meal_codes?: string[];
  /** Resolved server-side from the live SSR response (never from the browser). */
  ssr?: { baggage: unknown[]; meal: unknown[]; seat: unknown[] };
};

export type Up17FlightBooking = {
  bookingId: string | null;
  pnr: string | null;
  status: string | null;
  isTicketed: boolean;
  currency: string;
  total: number | null;
  passengers: { name: string; ticketNumber: string | null }[];
};

const isoDateTime = (value?: string): string | undefined =>
  value ? `${value.slice(0, 10)}T00:00:00` : undefined;

function toBookPassenger(p: Up17Passenger, ssr: { baggage: unknown[]; meal: unknown[]; seat?: unknown[] }) {
  return {
    Title: p.title,
    FirstName: p.first_name,
    LastName: p.last_name,
    PaxType: p.pax_type,
    DateOfBirth: isoDateTime(p.date_of_birth),
    Gender: p.gender,
    PassportNo: p.passport_no ?? "",
    PassportExpiry: isoDateTime(p.passport_expiry) ?? "",
    PassportIssue: isoDateTime(p.passport_issue) ?? "",
    Nationality: p.nationality.toUpperCase(),
    PAN: p.pan ?? "",
    AddressLine1: p.address_line1,
    AddressLine2: "",
    City: p.city,
    CountryCode: p.country_code.toUpperCase(),
    CountryName: p.country_code.toUpperCase() === "IN" ? "India" : "",
    ContactNo: p.contact_no,
    Email: p.email,
    IsLeadPax: p.is_lead,
    FFAirline: "",
    FFNumber: "",
    Baggage: ssr.baggage,
    Meal: ssr.meal,
    ...(ssr.seat && ssr.seat.length ? { Seat: ssr.seat } : {}),
    GSTCompanyAddress: "",
    GSTCompanyContactNumber: "",
    GSTCompanyName: "",
    GSTNumber: "",
    GSTCompanyEmail: "",
  };
}

function normalizeBooking(data: unknown): Up17FlightBooking {
  const root = asRec(data);
  const result = asRec(pick(root, ["Result", "result"]));
  const response = asRec(pick(result, ["Response", "FlightItinerary"]));
  const itinerary = Object.keys(response).length > 0 ? response : result;
  const fareRec = asRec(pick(itinerary, ["Fare", "fare"]));
  const paxRaw = pick(itinerary, ["Passenger", "Passengers"]);
  const passengers = Array.isArray(paxRaw)
    ? paxRaw.map((raw) => {
        const p = asRec(raw);
        const ticket = asRec(pick(p, ["Ticket"]));
        return {
          name: [str(pick(p, ["FirstName"])), str(pick(p, ["LastName"]))]
            .filter(Boolean)
            .join(" "),
          ticketNumber: str(pick(ticket, ["TicketNumber"])) || null,
        };
      })
    : [];
  const status = str(pick(itinerary, ["Status", "BookingStatus"])) || null;
  return {
    bookingId: str(pick(itinerary, ["BookingId"])) || str(pick(result, ["BookingId"])) || null,
    pnr: str(pick(itinerary, ["PNR"])) || str(pick(result, ["PNR"])) || null,
    status,
    isTicketed: passengers.some((p) => p.ticketNumber),
    currency: str(pick(fareRec, ["Currency", "CurrencyCode"])) || "INR",
    total: num(pick(fareRec, ["OfferedPrice", "PublishedPrice"])),
    passengers,
  };
}

export async function up17BookFlight(args: {
  resultIndex: string;
  searchTokenId: string;
  passengers: Up17Passenger[];
}): Promise<Up17Result<Up17FlightBooking>> {
  const res = await callUp17<unknown>("/airservice/rest/book", {
    SearchTokenId: args.searchTokenId,
    ResultIndex: args.resultIndex,
    Passengers: args.passengers.map((p) =>
      toBookPassenger(
        p,
        p.ssr ?? {
          baggage: (p.baggage_codes ?? []).map((code) => ({ Code: code })),
          meal: (p.meal_codes ?? []).map((code) => ({ Code: code })),
        },
      ),
    ),
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  return { ok: true, status: res.status, data: normalizeBooking(res.data) };
}

export async function up17FlightBookingDetail(args: {
  searchTokenId: string;
  bookingId?: string;
  pnr?: string;
}): Promise<Up17Result<Up17FlightBooking>> {
  const res = await callUp17<unknown>("/airservice/rest/getbookingdetail", {
    SearchTokenId: args.searchTokenId,
    BookingId: args.bookingId ?? "",
    PNR: args.pnr ?? "",
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  return { ok: true, status: res.status, data: normalizeBooking(res.data) };
}

// ---------------------------------------------------------------- calendar fares
// Official UP17 getcalendarfare: supplier-returned lowest fare per departure
// date. Never interpolated — dates without a supplier fare are simply absent.
export type Up17CalendarFare = { date: string; airline: string; fare: number; lowestOfMonth: boolean };

export async function up17CalendarFares(args: {
  origin: string;
  destination: string;
  date: string;
  cabin?: Up17SearchInput["cabin"];
}): Promise<Up17Result<{ fares: Up17CalendarFare[] }>> {
  const res = await callUp17<unknown>("/airservice/rest/getcalendarfare", {
    JourneyType: 1,
    PreferredCarriers: null,
    CabinClass: CABIN_MAP[args.cabin ?? "economy"] ?? 1,
    AirSegments: [{ Origin: args.origin.toUpperCase(), Destination: args.destination.toUpperCase(), PreferredTime: `${args.date}T00:00:00` }],
    Sources: null,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  const rows = (asRec(res.data)["Result"] as unknown[] | undefined) ?? [];
  const fares = rows
    .map((r) => asRec(r))
    .map((r) => ({
      date: str(r["DepartureDate"]).slice(0, 10),
      airline: str(r["AirlineCode"]),
      fare: Number(r["Fare"]),
      lowestOfMonth: r["IsLowestFareOfMonth"] === true,
    }))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date) && Number.isFinite(f.fare) && f.fare > 0);
  return { ok: true, status: res.status, data: { fares } };
}

// ---------------------------------------------------------------- cancellation
// Official UP17 cancelrequest (full or partial). Server-only; not exposed to
// customers and not certified until a controlled production test is approved.
export async function up17CancelFlight(args: {
  bookingId: string;
  searchTokenId: string;
  requestType: "FullCancellation" | "PartialCancellation";
  sectors?: { Origin: string; Destination: string }[];
  paxIds?: number[];
  remark?: string;
}): Promise<Up17Result<unknown>> {
  return callUp17<unknown>("/airservice/rest/cancelrequest", {
    BookingId: args.bookingId,
    SearchTokenId: args.searchTokenId,
    RequestType: args.requestType,
    ...(args.sectors?.length ? { Sectors: args.sectors } : {}),
    ...(args.paxIds?.length ? { PaxId: args.paxIds } : {}),
    Remark: args.remark ?? "Cancel Ticket",
  });
}

// ---------------------------------------------------------- flight extras (SSR)

export type FlightExtraKind = "baggage" | "meal" | "seat";
export type FlightExtra = {
  key: string;
  kind: FlightExtraKind;
  label: string;
  sector: string;
  price: number;
  currency: string;
};
export type FlightExtraSelection = { baggage?: string[]; meal?: string[]; seat?: string[] };

type RawExtras = { raw: Map<string, Rec>; list: FlightExtra[] };

function collectExtras(data: unknown, fallbackCurrency: string): RawExtras {
  const result = asRec(pick(asRec(data), ["Result", "result"]));
  const raw = new Map<string, Rec>();
  const list: FlightExtra[] = [];
  const add = (kind: FlightExtraKind, rec: Rec) => {
    const key = str(pick(rec, ["Key"]));
    const code = str(pick(rec, ["Code"]));
    if (!key || !code || /^No(Baggage|Meal|Seat)$/i.test(code) || raw.has(key)) return;
    if (kind === "seat") {
      const cls = str(pick(rec, ["SeatClass"]));
      if (num(pick(rec, ["AvailablityType"])) !== 1 || /booked/i.test(cls)) return;
    }
    const sector = [str(pick(rec, ["Origin"])), str(pick(rec, ["Destination"]))].filter(Boolean).join("-");
    const desc = str(pick(rec, ["AirlineDescription"]));
    const label =
      kind === "seat"
        ? `Seat ${code}${/gallery/i.test(str(pick(rec, ["SeatClass"]))) ? " (near galley)" : ""}`
        : desc || code;
    raw.set(key, rec);
    list.push({
      key,
      kind,
      label,
      sector,
      price: num(pick(rec, ["Price"])) ?? 0,
      currency: str(pick(rec, ["Currency"])) || fallbackCurrency,
    });
  };
  const walk = (kind: FlightExtraKind, v: unknown, depth = 0) => {
    if (depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(kind, x, depth + 1));
    const rec = v as Rec;
    if (pick(rec, ["Key"]) !== undefined && pick(rec, ["Code"]) !== undefined) return add(kind, rec);
    Object.values(rec).forEach((x) => walk(kind, x, depth + 1));
  };
  walk("baggage", pick(result, ["Baggage"]));
  walk("meal", pick(result, ["Meal", "MealDynamic"]));
  walk("seat", pick(result, ["Seats", "SeatDynamic"]));
  return { raw, list };
}

/** Live extras for a fare. The fare must be confirmed first for the SSR session to be valid. */
async function fetchExtras(args: { resultIndex: string; searchTokenId: string }): Promise<Up17Result<RawExtras & { currency: string }>> {
  const fare = await up17ConfirmFare(args);
  if (!fare.ok || !fare.data) return { ok: false, status: fare.status, error: fare.error ?? "Fare could not be confirmed." };
  const res = await callUp17<unknown>("/airservice/rest/ssr", {
    ResultIndex: args.resultIndex,
    SearchTokenId: args.searchTokenId,
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  return { ok: true, status: res.status, data: { ...collectExtras(res.data, fare.data.currency), currency: fare.data.currency } };
}

export async function flightExtras(args: { resultIndex: string; searchTokenId: string }) {
  const res = await fetchExtras(args);
  if (!res.ok || !res.data) return { ok: false as const, error: res.error ?? "Extras unavailable", extras: [] as FlightExtra[] };
  return { ok: true as const, error: null, extras: res.data.list };
}

/**
 * Resolves per-traveller selections against the live SSR list, returning the
 * authoritative extras total and the exact supplier objects to book. Unknown
 * or unavailable keys fail closed; a seat may be chosen by one traveller only.
 */
export async function resolveFlightExtras(args: {
  resultIndex: string;
  searchTokenId: string;
  selections: FlightExtraSelection[];
}): Promise<{ ok: true; total: number; perPax: { baggage: unknown[]; meal: unknown[]; seat: unknown[] }[] } | { ok: false; error: string }> {
  const any = args.selections.some((s) => (s.baggage?.length ?? 0) + (s.meal?.length ?? 0) + (s.seat?.length ?? 0) > 0);
  if (!any) return { ok: true, total: 0, perPax: args.selections.map(() => ({ baggage: [], meal: [], seat: [] })) };
  const res = await fetchExtras(args);
  if (!res.ok || !res.data) return { ok: false, error: "Selected extras could not be verified with the airline." };
  const { raw, list } = res.data;
  const byKey = new Map(list.map((e) => [e.key, e]));
  const seatsTaken = new Set<string>();
  let total = 0;
  const perPax: { baggage: unknown[]; meal: unknown[]; seat: unknown[] }[] = [];
  for (const sel of args.selections) {
    const out = { baggage: [] as unknown[], meal: [] as unknown[], seat: [] as unknown[] };
    for (const kind of ["baggage", "meal", "seat"] as const) {
      const sectors = new Set<string>();
      for (const key of sel[kind] ?? []) {
        const e = byKey.get(key);
        if (!e || e.kind !== kind) return { ok: false, error: "A selected extra is no longer available. Please reselect." };
        if (sectors.has(e.sector)) return { ok: false, error: "Only one option per flight sector can be selected." };
        sectors.add(e.sector);
        if (kind === "seat") {
          if (seatsTaken.has(key)) return { ok: false, error: "Each seat can be assigned to one traveller only." };
          seatsTaken.add(key);
        }
        total += e.price;
        out[kind].push(raw.get(key));
      }
    }
    perPax.push(out);
  }
  return { ok: true, total: Math.round(total * 100) / 100, perPax };
}
