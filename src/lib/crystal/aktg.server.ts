// AKTG (A&K Travel Group) production Shopping API adapter for the Crystal
// Cruises module. Server-only: the subscription key is read from the runtime
// environment inside the fetch call and never reaches the browser.
//
// Live operation in use: GET /shopping/v1/cruiseprices?currency=<ISO>
// It returns the complete Crystal sailing calendar with ship, sail date,
// duration, embark/debark ports, every bookable suite category, fare types,
// past-guest and combination savings, air credit, port charges, availability,
// payment schedule and cancellation penalties.
import type { CrystalFare, CrystalVoyage, CruiseStyle, SuiteCategory } from "./types";
import { CRYSTAL_SUPPLIER_ID, CRYSTAL_SHIPS } from "./content";

const BASE_URL = "https://api.aktravelgroup.com/shopping/v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60_000;

export interface AktgPriceRow {
  priceTypeCod?: string;
  priceTypeName?: string;
  categoryCod?: string;
  category?: string;
  priceSingle?: number | null;
  priceDouble?: number | null;
  priceExtraGuest?: number | null;
  priceChild?: number | null;
  pastGuestPriceDouble?: number | null;
  pastGuestDiscount?: number | null;
  portCharge?: number | null;
  availability?: string | null;
  comboSavPriceDouble?: number | null;
  comboSaving?: number | null;
  airCredit?: number | null;
}

export interface AktgVoyageRow {
  voyageNumber?: string;
  shipCod?: string;
  ship?: string;
  sailDate?: string;
  duration?: number;
  embarkPortCod?: string;
  embarkPort?: string;
  debarkPortCod?: string;
  debarkPort?: string;
  prices?: AktgPriceRow[];
  paymentsSchedule?: {
    categoryType?: string;
    optionDueDate?: string;
    optionPerc?: number | null;
    finalPaymentDate?: string;
  }[];
  penalties?: {
    suiteCategoryCod?: string;
    daysFrom?: number;
    daysTo?: number;
    amountPerc?: number | null;
    fixedAmount?: number | null;
  }[];
}

/* ------------------------------- geography -------------------------------- */

interface PortRef {
  name: string;
  country: string;
  destination: string;
}

/** Port code → Worldway destination taxonomy (publicly known geography). */
const PORTS: Record<string, PortRef> = {
  AKL: { name: "Auckland", country: "New Zealand", destination: "new-zealand" },
  AMS: { name: "Amsterdam", country: "Netherlands", destination: "northern-europe" },
  BCN: { name: "Barcelona", country: "Spain", destination: "mediterranean" },
  BGI: { name: "Bridgetown", country: "Barbados", destination: "caribbean" },
  BNE: { name: "Brisbane", country: "Australia", destination: "australia" },
  BOA: { name: "Bali", country: "Indonesia", destination: "asia" },
  BOS: { name: "Boston", country: "United States", destination: "north-america" },
  BUE: { name: "Buenos Aires", country: "Argentina", destination: "south-america" },
  CLL: { name: "Lima (Callao)", country: "Peru", destination: "south-america" },
  CPH: { name: "Copenhagen", country: "Denmark", destination: "northern-europe" },
  CTG: { name: "Cartagena", country: "Colombia", destination: "caribbean" },
  CVV: { name: "Civitavecchia (Rome)", country: "Italy", destination: "mediterranean" },
  DXB: { name: "Dubai", country: "United Arab Emirates", destination: "middle-east" },
  FLL: { name: "Fort Lauderdale", country: "United States", destination: "caribbean" },
  FSA: { name: "Fusina (Venice)", country: "Italy", destination: "mediterranean" },
  GYE: { name: "Guayaquil", country: "Ecuador", destination: "south-america" },
  HKG: { name: "Hong Kong", country: "Hong Kong SAR", destination: "asia" },
  JED: { name: "Jeddah", country: "Saudi Arabia", destination: "middle-east" },
  LCH: { name: "Laem Chabang", country: "Thailand", destination: "asia" },
  LEH: { name: "Le Havre", country: "France", destination: "northern-europe" },
  LIS: { name: "Lisbon", country: "Portugal", destination: "mediterranean" },
  LIV: { name: "Liverpool", country: "United Kingdom", destination: "northern-europe" },
  LPA: { name: "Canary Islands (Las Palmas)", country: "Spain", destination: "africa" },
  LTK: { name: "Lautoka", country: "Fiji", destination: "south-pacific" },
  MAO: { name: "Manaus / Amazon", country: "Brazil", destination: "south-america" },
  MCM: { name: "Monte Carlo", country: "Monaco", destination: "mediterranean" },
  MEL: { name: "Melbourne", country: "Australia", destination: "australia" },
  MLA: { name: "Valletta", country: "Malta", destination: "mediterranean" },
  MTR: { name: "Montreal", country: "Canada", destination: "north-america" },
  NYC: { name: "New York", country: "United States", destination: "north-america" },
  OSL: { name: "Oslo", country: "Norway", destination: "norway" },
  PAS: { name: "Puntarenas", country: "Costa Rica", destination: "south-america" },
  PIR: { name: "Athens (Piraeus)", country: "Greece", destination: "greek-islands" },
  PME: { name: "Portsmouth", country: "United Kingdom", destination: "northern-europe" },
  PPT: { name: "Papeete (Tahiti)", country: "French Polynesia", destination: "south-pacific" },
  PTY: { name: "Fuerte Amador (Panama City)", country: "Panama", destination: "caribbean" },
  QUE: { name: "Quebec City", country: "Canada", destination: "north-america" },
  REY: { name: "Reykjavik", country: "Iceland", destination: "northern-europe" },
  RIO: { name: "Rio de Janeiro", country: "Brazil", destination: "south-america" },
  SAN: { name: "San Diego", country: "United States", destination: "north-america" },
  SIN: { name: "Singapore", country: "Singapore", destination: "asia" },
  SJU: { name: "San Juan", country: "Puerto Rico", destination: "caribbean" },
  STO: { name: "Stockholm", country: "Sweden", destination: "northern-europe" },
  SWD: { name: "Seward", country: "United States", destination: "alaska" },
  TYO: { name: "Tokyo", country: "Japan", destination: "japan" },
  VAN: { name: "Vancouver", country: "Canada", destination: "alaska" },
  VAP: { name: "Valparaiso", country: "Chile", destination: "south-america" },
  YOK: { name: "Yokohama (Tokyo)", country: "Japan", destination: "japan" },
};

const DESTINATION_NAMES: Record<string, { name: string; region: string }> = {
  mediterranean: { name: "Mediterranean", region: "Europe" },
  "northern-europe": { name: "Northern Europe", region: "Europe" },
  norway: { name: "Norway & the Fjords", region: "Europe" },
  "greek-islands": { name: "Greek Islands", region: "Europe" },
  caribbean: { name: "Caribbean", region: "Caribbean" },
  alaska: { name: "Alaska", region: "North America" },
  "north-america": { name: "North America", region: "North America" },
  "south-pacific": { name: "South Pacific", region: "Oceania" },
  asia: { name: "Asia", region: "Asia" },
  japan: { name: "Japan", region: "Asia" },
  australia: { name: "Australia", region: "Oceania" },
  "new-zealand": { name: "New Zealand", region: "Oceania" },
  "middle-east": { name: "Middle East", region: "Middle East" },
  africa: { name: "Africa", region: "Africa" },
  "south-america": { name: "South America", region: "South America" },
  "world-cruise": { name: "World Cruise", region: "Global" },
};

function portRef(cod: string | undefined, fallbackName: string | undefined): PortRef {
  const hit = cod ? PORTS[cod.toUpperCase()] : undefined;
  if (hit) return hit;
  const name = (fallbackName ?? "").trim() || "Port";
  return { name, country: "", destination: "world-cruise" };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ------------------------------ suite mapping ------------------------------ */

export function mapSuiteCategory(categoryLabel: string, categoryCod: string): SuiteCategory {
  const v = `${categoryLabel} ${categoryCod}`.toLowerCase();
  if (v.includes("residence") || v.includes("owner")) return "residence";
  if (v.includes("penthouse")) return "penthouse";
  if (v.includes("expedition") || v.includes("zodiac")) return "expedition-suite";
  if (v.includes("veranda") || v.includes("balcon") || v.includes("panorama")) return "balcony";
  return "ocean-view";
}

function mapAvailability(raw: string | null | undefined): boolean | undefined {
  const v = (raw ?? "").toLowerCase();
  if (!v) return undefined;
  return v.startsWith("available") || v.startsWith("guarantee");
}

function voyageAvailability(prices: AktgPriceRow[]): CrystalVoyage["availability"] {
  const values = prices.map((p) => (p.availability ?? "").toLowerCase());
  if (values.some((v) => v.startsWith("available") || v.startsWith("guarantee"))) return "open";
  if (values.some((v) => v.startsWith("waitlist"))) return "waitlist";
  if (values.length > 0) return "closed";
  return "unknown";
}

function inferStyles(nights: number, prices: AktgPriceRow[], destination: string): CruiseStyle[] {
  const styles: CruiseStyle[] = ["ocean"];
  if (nights >= 60 || destination === "world-cruise") styles.push("world-cruise");
  else if (nights >= 18) styles.push("grand-voyage");
  if (prices.some((p) => /single/i.test(`${p.category ?? ""}`))) styles.push("solo");
  return [...new Set(styles)];
}

function shipMedia(shipSlug: string) {
  const ship = CRYSTAL_SHIPS.find((s) => s.slug === shipSlug);
  return { hero: ship?.hero, gallery: ship?.gallery ?? [] };
}

function money(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------ normalisation ------------------------------ */

export function normaliseAktgVoyage(row: AktgVoyageRow, currency: string): CrystalVoyage | null {
  const code = String(row.voyageNumber ?? "").trim();
  const sailDate = String(row.sailDate ?? "").slice(0, 10);
  if (!code || !sailDate) return null;

  const embark = portRef(row.embarkPortCod, row.embarkPort);
  const debark = portRef(row.debarkPortCod, row.debarkPort);
  const nights = Number(row.duration ?? 0) || 0;
  const shipName = String(row.ship ?? "").trim();
  const shipSlug = slugify(shipName || String(row.shipCod ?? ""));

  const destination =
    embark.destination === debark.destination
      ? embark.destination
      : nights >= 30
        ? "world-cruise"
        : embark.destination;
  const meta = DESTINATION_NAMES[destination] ?? DESTINATION_NAMES["world-cruise"]!;

  const priceRows = (row.prices ?? []).filter((p) => money(p.priceDouble) > 0);
  const fares: CrystalFare[] = priceRows.map((p) => {
    const label = String(p.category ?? "").trim();
    const cod = String(p.categoryCod ?? "").trim();
    const promoBits: string[] = [];
    if (money(p.pastGuestPriceDouble) && p.pastGuestDiscount)
      promoBits.push(`Past-guest saving ${Number(p.pastGuestDiscount)}%`);
    if (p.comboSaving) promoBits.push(`Combination saving ${Number(p.comboSaving)}%`);
    if (money(p.airCredit)) promoBits.push(`Air credit ${money(p.airCredit)} ${currency}`);
    return {
      suiteCategory: mapSuiteCategory(label, cod),
      gradeId: cod || undefined,
      gradeName: label.replace(/^[A-Z0-9]{3,4}\s*-\s*/, "").trim() || label,
      price: money(p.priceDouble),
      priceSingle: money(p.priceSingle) || undefined,
      portCharge: money(p.portCharge) || undefined,
      fareType: p.priceTypeName ? String(p.priceTypeName) : undefined,
      currency,
      available: mapAvailability(p.availability),
      availabilityLabel: p.availability ? String(p.availability) : undefined,
      promotion: promoBits.length ? promoBits.join(" · ") : undefined,
    };
  });

  const prices = fares.map((f) => f.price).filter((n) => n > 0);
  const promotions = [
    ...new Set(fares.flatMap((f) => (f.promotion ? f.promotion.split(" · ") : []))),
  ].slice(0, 4);

  const roundTrip = embark.name === debark.name;
  const title = roundTrip
    ? `${nights}-night ${embark.name} round trip`
    : `${nights}-night ${embark.name} to ${debark.name}`;

  const finalPayment = row.paymentsSchedule?.[0]?.finalPaymentDate?.slice(0, 10);

  return {
    code,
    title,
    subtitle: `${shipName} · departs ${sailDate}${roundTrip ? "" : ` · ${meta.name}`}`,
    shipSlug,
    shipName,
    destinationSlug: destination,
    destinationName: meta.name,
    region: meta.region,
    countries: [...new Set([embark.country, debark.country].filter(Boolean))],
    embarkPort: embark.name,
    disembarkPort: debark.name,
    nights,
    departureDate: sailDate,
    returnDate: nights > 0 ? addDays(sailDate, nights) : sailDate,
    styles: inferStyles(nights, priceRows, destination),
    itinerary: [],
    fares,
    priceFrom: prices.length ? Math.min(...prices) : undefined,
    currency,
    promotions,
    inclusions: [],
    media: shipMedia(shipSlug),
    availability: voyageAvailability(row.prices ?? []),
    dataSource: "licensed",
    supplierId: CRYSTAL_SUPPLIER_ID,
    updatedAt: new Date().toISOString(),
    fareType: priceRows[0]?.priceTypeName ? String(priceRows[0]!.priceTypeName) : undefined,
    finalPaymentDate: finalPayment || undefined,
    depositPercent:
      typeof row.paymentsSchedule?.[0]?.optionPerc === "number"
        ? Number(row.paymentsSchedule[0]!.optionPerc)
        : undefined,
    cancellationPolicy: (row.penalties ?? [])
      .map((p) => ({
        daysFrom: Number(p.daysFrom ?? 0),
        daysTo: Number(p.daysTo ?? 0),
        amountPercent: typeof p.amountPerc === "number" ? p.amountPerc : undefined,
        fixedAmount: typeof p.fixedAmount === "number" ? p.fixedAmount : undefined,
      }))
      .slice(0, 8),
  };
}

/* --------------------------------- fetching -------------------------------- */

export interface AktgFeedResult {
  voyages: CrystalVoyage[];
  currency: string;
  received: number;
  fetchedAt: string;
  durationMs: number;
  configured: boolean;
  error?: string;
}

const cache = new Map<string, AktgFeedResult>();

export function aktgConfigured(): boolean {
  return Boolean(process.env["CRYSTAL_AKTG_API_KEY"]);
}

export function invalidateAktgCache(): void {
  cache.clear();
}

async function requestJson(url: string, apiKey: string): Promise<unknown> {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { ApiKey: apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = `supplier responded ${res.status}`;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`supplier responded ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 2) throw new Error(lastError);
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError || "supplier request failed");
}

/** Fetch and normalise the live Crystal sailing calendar for one currency. */
export async function fetchAktgVoyages(
  currency = "USD",
  opts: { force?: boolean } = {},
): Promise<AktgFeedResult> {
  const cur = /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : "USD";
  const key = process.env["CRYSTAL_AKTG_API_KEY"];
  const now = Date.now();
  const cached = cache.get(cur);
  if (!opts.force && cached && now - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cached;
  }
  if (!key) {
    return {
      voyages: [],
      currency: cur,
      received: 0,
      fetchedAt: new Date().toISOString(),
      durationMs: 0,
      configured: false,
      error: "CRYSTAL_AKTG_API_KEY is not configured.",
    };
  }
  const started = Date.now();
  try {
    const payload = (await requestJson(`${BASE_URL}/cruiseprices?currency=${cur}`, key)) as {
      body?: { voyagePrices?: AktgVoyageRow[] };
      statusCod?: number;
      statusMessage?: string;
      errors?: unknown[];
    };
    const rows = payload?.body?.voyagePrices ?? [];
    const voyages = rows
      .map((r) => normaliseAktgVoyage(r, cur))
      .filter((v): v is CrystalVoyage => Boolean(v) && v!.fares.length > 0)
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
    const result: AktgFeedResult = {
      voyages,
      currency: cur,
      received: rows.length,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      configured: true,
    };
    cache.set(cur, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "supplier request failed";
    if (cached) return { ...cached, error: message };
    return {
      voyages: [],
      currency: cur,
      received: 0,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      configured: true,
      error: message,
    };
  }
}

/** Lightweight reachability probe used by the admin connector panel. */
export async function aktgHealth(): Promise<{ ok: boolean; message: string }> {
  const key = process.env["CRYSTAL_AKTG_API_KEY"];
  if (!key) return { ok: false, message: "CRYSTAL_AKTG_API_KEY is not configured." };
  try {
    const res = await fetchAktgVoyages("USD");
    if (res.error) return { ok: false, message: res.error };
    return {
      ok: res.voyages.length > 0,
      message: `${res.voyages.length} live voyages available (${res.received} supplier records).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "probe failed" };
  }
}
