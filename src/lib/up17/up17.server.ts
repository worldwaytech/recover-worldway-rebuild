// UP17 Communication Pvt Ltd travel API (flights / hotels / buses).
// Docs: https://travelapi.up17.in/up17_api.html — Basic-style header auth.

import { AIRPORT_ROWS } from "./airports.data.server";
import { searchUp17Cities, findUp17CityByName, type Up17City } from "./cities.data.server";

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

async function callUp17<T>(path: string, payload: unknown): Promise<Up17Result<T>> {
  const headers = up17Headers();
  if (!headers) {
    return { ok: false, status: 503, error: "UP17 API credentials are not configured" };
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
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
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  cabinBaggage: string | null;
  checkInBaggage: string | null;
};

export type Up17Fare = {
  currency: string;
  total: number | null;
  base: number | null;
  tax: number | null;
};

export type Up17FlightOffer = {
  recommendedRank: number;
  resultIndex: string;
  airline: string;
  airlineCode: string;
  flightNumbers: string[];
  origin: string;
  destination: string;
  departure: string | null;
  arrival: string | null;
  stops: number;
  durationMin: number | null;
  refundable: boolean | null;
  fare: Up17Fare;
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

function deepFindResults(value: unknown, depth = 0): Rec[] {
  if (depth > 6 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    const flat = value.flatMap((v) => (Array.isArray(v) ? v : [v]));
    const recs = flat.filter((v) => v && typeof v === "object") as Rec[];
    if (recs.some((r) => pick(r, ["ResultIndex", "resultIndex", "Segments", "segments"]) !== undefined)) {
      return recs;
    }
    return recs.flatMap((r) => deepFindResults(r, depth + 1));
  }
  const rec = value as Rec;
  for (const key of ["Results", "results", "Response", "response", "data", "Data", "TripInfos"]) {
    if (rec[key] !== undefined) {
      const hit = deepFindResults(rec[key], depth + 1);
      if (hit.length) return hit;
    }
  }
  return Object.values(rec).flatMap((v) => deepFindResults(v, depth + 1));
}

function normalizeSegment(raw: Rec): Up17FlightSegment {
  const airlineRec = asRec(pick(raw, ["Airline", "airline"]));
  const originRec = asRec(pick(raw, ["Origin", "origin"]));
  const destRec = asRec(pick(raw, ["Destination", "destination"]));
  const originAirport = asRec(pick(originRec, ["Airport", "airport"]));
  const destAirport = asRec(pick(destRec, ["Airport", "airport"]));
  return {
    airline: str(pick(airlineRec, ["AirlineName", "Name"])) || str(pick(raw, ["AirlineName"])),
    airlineCode: str(pick(airlineRec, ["AirlineCode", "Code"])) || str(pick(raw, ["AirlineCode"])),
    flightNumber:
      str(pick(airlineRec, ["FlightNumber"])) || str(pick(raw, ["FlightNumber", "flightNumber"])),
    origin:
      str(pick(originAirport, ["AirportCode", "Code"])) ||
      str(pick(originRec, ["AirportCode", "Code"])) ||
      str(pick(raw, ["Origin"])),
    destination:
      str(pick(destAirport, ["AirportCode", "Code"])) ||
      str(pick(destRec, ["AirportCode", "Code"])) ||
      str(pick(raw, ["Destination"])),
    departure:
      str(pick(originRec, ["DepTime", "DepartureTime"])) ||
      str(pick(raw, ["DepTime", "DepartureTime"])) ||
      null,
    arrival:
      str(pick(destRec, ["ArrTime", "ArrivalTime"])) ||
      str(pick(raw, ["ArrTime", "ArrivalTime"])) ||
      null,
    durationMin: num(pick(raw, ["Duration", "duration", "AccumulatedDuration"])),
    cabinBaggage: str(pick(raw, ["CabinBaggage", "cabinBaggage"])) || null,
    checkInBaggage: str(pick(raw, ["Baggage", "baggage", "CheckInBaggage"])) || null,
  };
}

function normalizeOffer(raw: Rec): Up17FlightOffer {
  const segmentsRaw = pick(raw, ["Segments", "segments"]);
  const flatSegments: Rec[] = Array.isArray(segmentsRaw)
    ? (segmentsRaw.flatMap((s) => (Array.isArray(s) ? s : [s])).filter(Boolean) as Rec[])
    : [];
  const segments = flatSegments.map(normalizeSegment);
  const fareRec = asRec(pick(raw, ["Fare", "fare"]));
  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    recommendedRank: 0,
    resultIndex: str(pick(raw, ["ResultIndex", "resultIndex", "Id", "id"])),
    airline: first?.airline || str(pick(raw, ["AirlineName", "ValidatingAirline"])),
    airlineCode: first?.airlineCode || str(pick(raw, ["ValidatingAirline", "AirlineCode"])),
    flightNumbers: segments
      .map((s) => `${s.airlineCode}${s.flightNumber}`.trim())
      .filter((v) => v.length > 1),
    origin: first?.origin ?? "",
    destination: last?.destination ?? "",
    departure: first?.departure ?? null,
    arrival: last?.arrival ?? null,
    stops: Math.max(segments.length - 1, 0),
    durationMin: segments.reduce<number | null>(
      (acc, s) => (s.durationMin === null ? acc : (acc ?? 0) + s.durationMin),
      null,
    ),
    refundable:
      typeof pick(raw, ["IsRefundable", "isRefundable"]) === "boolean"
        ? (pick(raw, ["IsRefundable", "isRefundable"]) as boolean)
        : null,
    fare: {
      currency: str(pick(fareRec, ["Currency", "CurrencyCode"])) || "INR",
      total: num(pick(fareRec, ["PublishedFare", "OfferedFare", "TotalFare", "Total"])),
      base: num(pick(fareRec, ["BaseFare", "Base"])),
      tax: num(pick(fareRec, ["Tax", "TotalTax", "Taxes"])),
    },
    segments,
    baggageOptions: [],
  };
}

/** Recommendation score: cheapest + fastest + fewest stops wins rank #1. */
function rankOffers(offers: Up17FlightOffer[]): Up17FlightOffer[] {
  const fares = offers.map((o) => o.fare.total ?? Number.POSITIVE_INFINITY);
  const durations = offers.map((o) => o.durationMin ?? Number.POSITIVE_INFINITY);
  const minFare = Math.min(...fares.filter(Number.isFinite), 1);
  const minDur = Math.min(...durations.filter(Number.isFinite), 1);
  const scored = offers.map((o) => {
    const fare = o.fare.total ?? minFare * 3;
    const dur = o.durationMin ?? minDur * 3;
    const score = (fare / minFare) * 0.6 + (dur / minDur) * 0.3 + o.stops * 0.1;
    return { o, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s, i) => ({ ...s.o, recommendedRank: i + 1 }));
}

/** Synthesise the standard 1-5 extra check-in baggage ladder for any airline. */
export function defaultBaggageLadder(currency = "INR"): Up17BaggageOption[] {
  return [1, 2, 3, 4, 5].map((tier) => ({
    tier,
    code: `XBAG${tier}`,
    label: `Extra check-in baggage ${tier} (+${tier * 5}kg)`,
    weightKg: tier * 5,
    price: null,
    currency,
  }));
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
    const weight = num(pick(rec, ["Weight", "weight"]));
    const code = str(pick(rec, ["Code", "code", "SSRCode", "BaggageCode"]));
    const desc = str(pick(rec, ["Description", "description", "Text"]));
    if ((weight !== null || /bag/i.test(desc) || /BAG/i.test(code)) && (code || desc)) {
      found.push({
        tier: 0,
        code: code || desc,
        label: desc || `${weight ?? ""}kg extra baggage`,
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
    .sort((a, b) => (a.weightKg ?? 0) - (b.weightKg ?? 0) || (a.price ?? 0) - (b.price ?? 0))
    .slice(0, 5)
    .map((o, i) => ({ ...o, tier: i + 1, label: `Extra check-in baggage ${i + 1} — ${o.label}` }));
  return list.length ? list : defaultBaggageLadder(currency);
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
    PreferredCarriers: [],
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
  const token =
    str(pick(root, ["SearchTokenId"])) ||
    str(pick(asRec(pick(root, ["Response", "data"])), ["SearchTokenId"])) ||
    null;
  const raw = deepFindResults(res.data);
  const offers = rankOffers(raw.map(normalizeOffer)).map((o) => ({
    ...o,
    baggageOptions: defaultBaggageLadder(o.fare.currency),
  }));
  return {
    ok: true,
    status: res.status,
    data: { searchTokenId: token || null, offers, count: offers.length },
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
  if (!res.ok) {
    return {
      ok: true,
      status: res.status,
      data: { options: defaultBaggageLadder(args.currency ?? "INR") },
    };
  }
  return {
    ok: true,
    status: res.status,
    data: { options: normalizeBaggage(res.data, args.currency ?? "INR") },
  };
}
