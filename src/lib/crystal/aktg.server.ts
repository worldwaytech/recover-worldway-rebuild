// AKTG (A&K Travel Group) Crystal Cruises production catalogue builder.
//
// Server-only composition layer over the documented AKTG Shopping API
// operations (see aktg-client.server.ts). It merges:
//   • get-voyages                  → voyage records, itineraries, media, maps
//   • get-cruise-suite-category-prices-json → suite fares, deposits, penalties
//   • get-prices-promotions        → promotional fares, deposits, penalties
//   • get-price-suite-availability → live inventory revalidation per voyage
//   • get-available-destinations / get-ports / get-ship-suite-categories /
//     get-price-types / get-promotions → reference data
//
// The subscription key never leaves the server; only normalised,
// customer-facing voyage records cross the RPC boundary.
import type { CrystalFare, CrystalVoyage, CrystalVoyageDay, CruiseStyle, SuiteCategory } from "./types";
import { CRYSTAL_SUPPLIER_ID, CRYSTAL_SHIPS } from "./content";
import {
  AktgError,
  aktgConfigured as clientConfigured,
  getCruiseSuiteCategoryPrices,
  getDestinations,
  getPriceAndAvailability,
  getPriceTypes,
  getPorts,
  getPricesAndPromotions,
  getPromotions,
  getShipSuiteCategories,
  getVoyagePriceTypes,
  getVoyages,
  invalidateAktgClientCache,
  type AktgAvailabilityRow,
  type AktgItineraryRow,
  type AktgPenaltyRow,
  type AktgPaymentScheduleRow,
  type AktgPricePromotionRow,
  type AktgSuitePriceRow,
  type AktgVoyagePriceRow,
  type AktgVoyageProduct,
} from "./aktg-client.server";

const CACHE_TTL_MS = 30 * 60 * 1000;

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
  REK: { name: "Reykjavik", country: "Iceland", destination: "northern-europe" },
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

function portRef(cod: string | undefined | null, fallbackName: string | undefined | null): PortRef {
  const hit = cod ? PORTS[String(cod).toUpperCase()] : undefined;
  if (hit) return hit;
  const name = String(fallbackName ?? "").trim() || "Port";
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

function voyageAvailability(labels: (string | null | undefined)[]): CrystalVoyage["availability"] {
  const values = labels.map((p) => (p ?? "").toLowerCase()).filter(Boolean);
  if (values.some((v) => v.startsWith("available") || v.startsWith("guarantee"))) return "open";
  if (values.some((v) => v.startsWith("waitlist"))) return "waitlist";
  if (values.length > 0) return "closed";
  return "unknown";
}

function inferStyles(
  nights: number,
  destination: string,
  voyageType: string | null | undefined,
  voyageClass: string | null | undefined,
  fareTypes: string[],
): CruiseStyle[] {
  const styles: CruiseStyle[] = [];
  const type = `${voyageType ?? ""} ${voyageClass ?? ""}`.toLowerCase();
  styles.push(type.includes("expedition") ? "expedition" : "ocean");
  const fares = fareTypes.join(" ").toLowerCase();
  if (nights >= 60 || destination === "world-cruise" || fares.includes("world cruise"))
    styles.push("world-cruise");
  else if (nights >= 18 || fares.includes("grand journey")) styles.push("grand-voyage");
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

function isoDate(raw: string | null | undefined): string {
  return String(raw ?? "").slice(0, 10);
}

function trimTime(raw: string | null | undefined): string | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return undefined;
  return v.slice(0, 5);
}

/** Supplier media URLs contain literal spaces; encode them so browsers load them. */
function mediaUrl(raw: string | null | undefined): string | undefined {
  const v = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return undefined;
  try {
    const u = new URL(v);
    u.pathname = u.pathname.split("/").map((seg) => encodeURIComponent(decodeURIComponent(seg))).join("/");
    return u.toString();
  } catch {
    return v.replace(/ /g, "%20");
  }
}

function stripHtml(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------ normalisation ------------------------------ */

function itineraryDays(rows: AktgItineraryRow[] | null | undefined): CrystalVoyageDay[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => Number(a.pos ?? a.day ?? 0) - Number(b.pos ?? b.day ?? 0))
    .map((r, i) => {
      const port = String(r.cityName ?? "At sea").trim() || "At sea";
      const atSea = /at sea|day at sea|cruising/i.test(port);
      return {
      day: Number(r.day ?? i + 1),
      date: isoDate(r.itineraryDate) || undefined,
      port,
      country: r.country ? String(r.country) : undefined,
      arrive: trimTime(r.arrivalTime),
      depart: trimTime(r.departTime),
      summary:
        [
          r.isOvernight && !atSea ? "Overnight in port" : undefined,
          r.dockAnchor && !atSea ? `${r.dockAnchor} berth` : undefined,
          r.dressCode ? `Dress: ${r.dressCode}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      };
    });
}

function fareFromSuitePrice(p: AktgSuitePriceRow, currency: string): CrystalFare {
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
    priceExtraGuest: money(p.priceExtraGuest) || undefined,
    priceChild: money(p.priceChild) || undefined,
    pastGuestPrice: money(p.pastGuestPriceDouble) || undefined,
    portCharge: money(p.portCharge) || undefined,
    fareType: p.priceTypeName ? String(p.priceTypeName) : undefined,
    fareCode: p.priceTypeCod ? String(p.priceTypeCod) : undefined,
    currency,
    available: mapAvailability(p.availability),
    availabilityLabel: p.availability ? String(p.availability) : undefined,
    promotion: promoBits.length ? promoBits.join(" · ") : undefined,
  };
}

function fareFromPromotionRow(p: AktgPricePromotionRow, currency: string): CrystalFare {
  const label = String(p.category ?? "").trim();
  const cod = String(p.categoryCod ?? "").trim();
  const base = money(p.priceDouble);
  const discounted = money(p.discountPriceDouble) || base;
  const promoBits: string[] = [];
  if (p.promoDescription) promoBits.push(stripHtml(p.promoDescription).slice(0, 140));
  if (discounted && base && discounted < base)
    promoBits.push(`Save ${money(base - discounted)} ${currency} per guest`);
  if (p.pastGuestDiscount) promoBits.push(`Past-guest saving ${Number(p.pastGuestDiscount)}%`);
  return {
    suiteCategory: mapSuiteCategory(label, cod),
    gradeId: cod || undefined,
    gradeName: label.replace(/^[A-Z0-9]{3,4}\s*-\s*/, "").trim() || label,
    price: discounted || base,
    priceBeforeDiscount: discounted && base && discounted < base ? base : undefined,
    priceSingle: money(p.discountPriceSingle) || money(p.priceSingle) || undefined,
    priceExtraGuest: money(p.discountPriceExtraGuest) || money(p.priceExtraGuest) || undefined,
    priceChild: money(p.discountPriceChild) || money(p.priceChild) || undefined,
    pastGuestPrice: money(p.pastCCDiscPriceDouble) || money(p.pastCCPriceDouble) || undefined,
    portCharge: money(p.portCharge) || undefined,
    tax: money(p.tax) || undefined,
    maxCapacity: p.maxCapacity ? Number(p.maxCapacity) : undefined,
    fareType: p.priceTypeName ? String(p.priceTypeName) : undefined,
    fareCode: p.priceTypeCod ? String(p.priceTypeCod) : undefined,
    promoId: p.promoID ? Number(p.promoID) : undefined,
    currency,
    available: mapAvailability(p.availability),
    availabilityLabel: p.availability ? String(p.availability) : undefined,
    promotion: promoBits.length ? promoBits.join(" · ") : undefined,
  };
}

/** Normalise a live availability row into a revalidated fare. */
export function fareFromAvailability(row: AktgAvailabilityRow, currency: string): CrystalFare {
  const label = String(row.category ?? "").trim();
  const cod = String(row.categoryCod ?? "").trim();
  const totalAvailable = Number(row.totAV ?? 0) + Number(row.totGTY ?? 0);
  return {
    suiteCategory: mapSuiteCategory(label, cod),
    gradeId: cod || undefined,
    gradeName: label.replace(/^[A-Z0-9]{3,4}\s*-\s*/, "").trim() || label,
    price: money(row.priceDouble),
    priceSingle: money(row.priceSingle) || undefined,
    priceExtraGuest: money(row.priceExtraGuest) || undefined,
    priceChild: money(row.priceChild) || undefined,
    pastGuestPrice: money(row.pastCCPriceDouble) || undefined,
    portCharge: money(row.portCharge) || undefined,
    tax: money(row.tax) || undefined,
    maxCapacity: row.maxCapacity ? Number(row.maxCapacity) : undefined,
    fareType: row.priceTypeName ? String(row.priceTypeName) : undefined,
    fareCode: row.priceTypeCod ? String(row.priceTypeCod) : undefined,
    currency: String(row.currency ?? currency),
    available: totalAvailable > 0,
    availabilityCount: totalAvailable,
    guaranteeCount: Number(row.totGTY ?? 0) || undefined,
    sellableOnline: row.isSellableFromWeb ? String(row.isSellableFromWeb) === "Y" : undefined,
    availabilityLabel:
      totalAvailable > 0
        ? `${totalAvailable} suite${totalAvailable === 1 ? "" : "s"} available`
        : "Waitlist",
  };
}

function penalties(rows: (AktgPenaltyRow | undefined)[]): CrystalVoyage["cancellationPolicy"] {
  return rows
    .filter((p): p is AktgPenaltyRow => Boolean(p))
    .map((p) => ({
      daysFrom: Number(p.daysFrom ?? 0),
      daysTo: Number(p.daysTo ?? 0),
      amountPercent: typeof p.amountPerc === "number" ? p.amountPerc : undefined,
      fixedAmount: typeof p.fixedAmount === "number" ? p.fixedAmount : undefined,
    }))
    .slice(0, 10);
}

interface VoyageCommerce {
  fares: CrystalFare[];
  paymentSchedule?: AktgPaymentScheduleRow;
  penalties: AktgPenaltyRow[];
  promotionNames: string[];
}

/**
 * Normalise one voyage product record, enriched with commercial data from the
 * pricing operations. Exported for tests.
 */
export function normaliseAktgVoyage(
  product: AktgVoyageProduct,
  commerce: VoyageCommerce,
  currency: string,
): CrystalVoyage | null {
  const code = String(product.voyageNumber ?? "").trim();
  const sailDate = isoDate(product.embarkDate);
  if (!code || !sailDate) return null;

  const embark = portRef(product.embarkPortCod, product.embarkPort);
  const debark = portRef(product.debarkPortCod, product.debarkPort);
  const nights = Number(product.duration ?? 0) || 0;
  const shipName = String(product.ship ?? "").trim();
  const shipSlug = slugify(shipName || String(product.shipCod ?? ""));

  const destination =
    embark.destination === debark.destination
      ? embark.destination
      : nights >= 30
        ? "world-cruise"
        : embark.destination;
  const meta = DESTINATION_NAMES[destination] ?? DESTINATION_NAMES["world-cruise"]!;

  const fares = commerce.fares.filter((f) => f.price > 0);
  const prices = fares.map((f) => f.price).filter((n) => n > 0);
  const itinerary = itineraryDays(product.itineraries);
  const countries = [
    ...new Set(
      [embark.country, debark.country, ...itinerary.map((d) => d.country ?? "")].filter(
        (c): c is string => Boolean(c) && c !== "At sea",
      ),
    ),
  ];

  const roundTrip = embark.name === debark.name;
  const title =
    String(product.title ?? "").trim() ||
    (roundTrip
      ? `${nights}-night ${embark.name} round trip`
      : `${nights}-night ${embark.name} to ${debark.name}`);

  const schedule = commerce.paymentSchedule;
  const promotions = [
    ...new Set([
      ...commerce.promotionNames,
      ...fares.flatMap((f) => (f.promotion ? f.promotion.split(" · ") : [])),
    ]),
  ].slice(0, 6);

  const media = shipMedia(shipSlug);
  const gallery = [
    ...new Set(
      [mediaUrl(product.image1), mediaUrl(product.image2), ...media.gallery].filter(
        (s): s is string => Boolean(s),
      ),
    ),
  ];

  return {
    code,
    voyageId: product.voyageID ? Number(product.voyageID) : undefined,
    title,
    subtitle: `${shipName} · departs ${sailDate}${roundTrip ? "" : ` · ${meta.name}`}`,
    description: stripHtml(product.voyageDescription) || undefined,
    shipSlug,
    shipName,
    shipCode: product.shipCod ? String(product.shipCod) : undefined,
    destinationSlug: destination,
    destinationName: meta.name,
    supplierDestinationId: product.destinationID ? Number(product.destinationID) : undefined,
    region: meta.region,
    countries,
    embarkPort: embark.name,
    embarkPortCode: product.embarkPortCod ? String(product.embarkPortCod) : undefined,
    disembarkPort: debark.name,
    disembarkPortCode: product.debarkPortCod ? String(product.debarkPortCod) : undefined,
    nights,
    departureDate: sailDate,
    returnDate: isoDate(product.debarkDate) || (nights > 0 ? addDays(sailDate, nights) : sailDate),
    styles: inferStyles(
      nights,
      destination,
      product.voyageType,
      product.voyageClass,
      fares.map((f) => f.fareType ?? ""),
    ),
    voyageType: product.voyageType ? String(product.voyageType) : undefined,
    voyageClass: product.voyageClass ? String(product.voyageClass) : undefined,
    itinerary,
    fares,
    priceFrom: prices.length ? Math.min(...prices) : money(product.price) || undefined,
    currency,
    promotions,
    inclusions: [],
    media: {
      hero: mediaUrl(product.image1) ?? media.hero,
      gallery,
      mapSvg: mediaUrl(product.mapSVG),
      mapPng: mediaUrl(product.mapPNG),
      mapPdf: mediaUrl(product.map),
      itineraryPdf: mediaUrl(product.itineraryPdf),
    },
    availability:
      product.isWaitListed === "Y"
        ? "waitlist"
        : product.isAvailable === false
          ? "closed"
          : voyageAvailability(fares.map((f) => f.availabilityLabel)),
    dataSource: "licensed",
    supplierId: CRYSTAL_SUPPLIER_ID,
    updatedAt: new Date().toISOString(),
    fareType: fares[0]?.fareType,
    finalPaymentDate: isoDate(schedule?.finalPaymentDate) || undefined,
    depositPercent: typeof schedule?.optionPerc === "number" ? schedule.optionPerc : undefined,
    depositDueDate: isoDate(schedule?.optionDueDate) || undefined,
    cancellationPolicy: penalties(commerce.penalties),
  };
}

/* --------------------------------- catalogue -------------------------------- */

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
  return clientConfigured();
}

export function invalidateAktgCache(): void {
  cache.clear();
  invalidateAktgClientCache();
}

function normCurrency(currency: string): string {
  return /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : "USD";
}

function keyOf(voyageNumber: string | null | undefined): string {
  return String(voyageNumber ?? "").trim();
}

/** Build the merged commercial index for every voyage in one currency. */
async function commerceIndex(currency: string, force: boolean) {
  const [priced, promos] = await Promise.all([
    getCruiseSuiteCategoryPrices({ currency }, { force }).catch(() => null),
    getPricesAndPromotions({ currency }, { force }).catch(() => null),
  ]);

  const byVoyage = new Map<string, VoyageCommerce>();

  const ensure = (code: string): VoyageCommerce => {
    let hit = byVoyage.get(code);
    if (!hit) {
      hit = { fares: [], penalties: [], promotionNames: [] };
      byVoyage.set(code, hit);
    }
    return hit;
  };

  // Promotional fares take precedence (they carry live discounts).
  if (promos) {
    const promoNames = new Map<number, string>();
    for (const p of promos.promotions)
      if (p.promoID) promoNames.set(Number(p.promoID), String(p.promoName ?? ""));
    for (const row of promos.prices) {
      const code = keyOf(row.voyageNumber);
      if (!code) continue;
      const entry = ensure(code);
      entry.fares.push(fareFromPromotionRow(row, currency));
      if (row.promoID) {
        const name = promoNames.get(Number(row.promoID));
        if (name && !entry.promotionNames.includes(name)) entry.promotionNames.push(name);
      }
    }
    for (const s of promos.paymentSchedules) {
      const code = keyOf(s.voyageNumber);
      if (!code) continue;
      const entry = ensure(code);
      if (!entry.paymentSchedule) entry.paymentSchedule = s;
    }
    for (const p of promos.penalties) {
      const code = keyOf(p.voyageNumber);
      if (!code) continue;
      ensure(code).penalties.push(p);
    }
  }

  // Fill any voyage without promotional pricing from the suite-price feed.
  for (const row of priced?.body?.voyagePrices ?? ([] as AktgVoyagePriceRow[])) {
    const code = keyOf(row.voyageNumber);
    if (!code) continue;
    const entry = ensure(code);
    if (entry.fares.length === 0)
      entry.fares = (row.prices ?? []).map((p) => fareFromSuitePrice(p, currency));
    if (!entry.paymentSchedule) entry.paymentSchedule = row.paymentsSchedule?.[0];
    if (entry.penalties.length === 0) entry.penalties = row.penalties ?? [];
  }

  return byVoyage;
}

/** Fetch and normalise the live Crystal catalogue for one currency. */
export async function fetchAktgVoyages(
  currency = "USD",
  opts: { force?: boolean } = {},
): Promise<AktgFeedResult> {
  const cur = normCurrency(currency);
  const now = Date.now();
  const cached = cache.get(cur);
  if (!opts.force && cached && now - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cached;
  }
  if (!aktgConfigured()) {
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
    const [products, commerce] = await Promise.all([
      getVoyages({ currency: cur, pageSize: 500 }, { force: Boolean(opts.force) }),
      commerceIndex(cur, Boolean(opts.force)),
    ]);
    const rows = products.body?.voyages ?? [];
    const voyages = rows
      .map((p) =>
        normaliseAktgVoyage(
          p,
          commerce.get(keyOf(p.voyageNumber)) ?? {
            fares: [],
            penalties: [],
            promotionNames: [],
          },
          cur,
        ),
      )
      .filter((v): v is CrystalVoyage => Boolean(v))
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
    const message =
      err instanceof AktgError || err instanceof Error ? err.message : "supplier request failed";
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

/* ------------------------------- revalidation ------------------------------- */

export interface AktgRevalidation {
  voyageNumber: string;
  currency: string;
  checkedAt: string;
  live: boolean;
  fares: CrystalFare[];
  availability: CrystalVoyage["availability"];
  priceFrom?: number;
  depositPercent?: number;
  depositDueDate?: string;
  finalPaymentDate?: string;
  cancellationPolicy?: CrystalVoyage["cancellationPolicy"];
  /** Fare types published for this voyage (get-voyage-price-types). */
  priceTypes: { code: string; name: string; currency?: string }[];
  error?: string;
}

/**
 * Live price and availability revalidation for one voyage — called before a
 * quote or checkout so the customer never transacts on a stale fare.
 */
export async function revalidateAktgVoyage(
  voyageNumber: string,
  currency = "USD",
): Promise<AktgRevalidation> {
  const cur = normCurrency(currency);
  const code = voyageNumber.trim();
  const base: AktgRevalidation = {
    voyageNumber: code,
    currency: cur,
    checkedAt: new Date().toISOString(),
    live: false,
    fares: [],
    availability: "unknown",
    priceTypes: [],
  };
  if (!code) return { ...base, error: "voyageNumber is required." };
  if (!aktgConfigured()) return { ...base, error: "CRYSTAL_AKTG_API_KEY is not configured." };
  try {
    const [avail, promos, voyageFareTypes] = await Promise.all([
      getPriceAndAvailability({ currency: cur, voyageNumber: code }, { force: true }),
      getPricesAndPromotions({ currency: cur, voyageNumber: code }, { force: true }).catch(
        () => null,
      ),
      getVoyagePriceTypes({ currency: cur, voyageNumber: code }).catch(() => null),
    ]);
    const rows = (avail.body?.availability ?? []).filter((r) => keyOf(r.voyageNumber) === code);
    const fares = rows.map((r) => fareFromAvailability(r, cur)).filter((f) => f.price > 0);
    const prices = fares.map((f) => f.price);
    const schedule = promos?.paymentSchedules?.[0];
    const priceTypes = (voyageFareTypes?.body?.voyagePriceTypes ?? [])
      .filter((p) => p.priceTypeCod && keyOf(p.voyageNumber || code) === code)
      .map((p) => ({
        code: String(p.priceTypeCod),
        name: String(p.priceTypeName ?? "").trim(),
        currency: p.currency ? String(p.currency) : undefined,
      }));
    return {
      ...base,
      live: true,
      fares,
      priceTypes,
      availability: fares.some((f) => f.available)
        ? "open"
        : fares.length
          ? "waitlist"
          : "unknown",
      priceFrom: prices.length ? Math.min(...prices) : undefined,
      depositPercent: typeof schedule?.optionPerc === "number" ? schedule.optionPerc : undefined,
      depositDueDate: isoDate(schedule?.optionDueDate) || undefined,
      finalPaymentDate: isoDate(schedule?.finalPaymentDate) || undefined,
      cancellationPolicy: promos ? penalties(promos.penalties) : undefined,
    };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : "supplier request failed",
    };
  }
}

/* ----------------------------- reference data ------------------------------ */

export interface AktgReferenceData {
  destinations: { id: number; name: string; description?: string; image?: string }[];
  ports: { code: string; cityCode: string; name: string; country: string; lat?: number; lng?: number }[];
  ships: { code: string; name: string; suiteCategories: { code: string; name: string; group?: string }[] }[];
  priceTypes: { code: string; name: string }[];
  voyagePriceTypes: { voyageNumber: string; code: string; name: string; currency?: string }[];
  promotions: { id: number; name: string; type?: string; description?: string }[];
  fetchedAt: string;
  error?: string;
}

/** Supplier reference catalogues, used by search facets and the admin panel. */
export async function fetchAktgReferenceData(): Promise<AktgReferenceData> {
  const empty: AktgReferenceData = {
    destinations: [],
    ports: [],
    ships: [],
    priceTypes: [],
    voyagePriceTypes: [],
    promotions: [],
    fetchedAt: new Date().toISOString(),
  };
  if (!aktgConfigured()) return { ...empty, error: "CRYSTAL_AKTG_API_KEY is not configured." };
  try {
    const [dest, ports, ships, priceTypes, promos, voyageFareTypes] = await Promise.all([
      getDestinations().catch(() => null),
      getPorts({ realCity: true }).catch(() => null),
      getShipSuiteCategories().catch(() => null),
      getPriceTypes().catch(() => null),
      getPromotions().catch(() => null),
      getVoyagePriceTypes().catch(() => null),
    ]);
    return {
      destinations: (dest?.body?.destinations ?? [])
        .filter((d) => d.destinationID)
        .map((d) => ({
          id: Number(d.destinationID),
          name: String(d.destinationName ?? "").trim(),
          description: stripHtml(d.destinationDescription) || undefined,
          image: d.destinationImage1 || undefined,
        })),
      ports: (ports?.body?.ports ?? [])
        .filter((p) => p.portCod)
        .map((p) => ({
          code: String(p.portCod),
          cityCode: String(p.cityCod ?? ""),
          name: String(p.city ?? p.name ?? "").trim(),
          country: String(p.country ?? "").trim(),
          lat: typeof p.latitude === "number" ? p.latitude : undefined,
          lng: typeof p.longitude === "number" ? p.longitude : undefined,
        })),
      ships: (ships?.body?.ships ?? []).map((s) => ({
        code: String(s.shipCod ?? ""),
        name: String(s.ship ?? "").trim(),
        suiteCategories: (s.suiteCategories ?? []).map((c) => ({
          code: String(c.suiteCategoryCod ?? ""),
          name: String(c.suiteCategory ?? "").trim(),
          group: c.suiteCategoryGroupCod ? String(c.suiteCategoryGroupCod) : undefined,
        })),
      })),
      priceTypes: (priceTypes?.body?.priceTypes ?? [])
        .filter((p) => p.priceTypeCod)
        .map((p) => ({ code: String(p.priceTypeCod), name: String(p.priceTypeName ?? "").trim() })),
      voyagePriceTypes: (voyageFareTypes?.body?.voyagePriceTypes ?? [])
        .filter((p) => p.voyageNumber && p.priceTypeCod)
        .map((p) => ({
          voyageNumber: String(p.voyageNumber),
          code: String(p.priceTypeCod),
          name: String(p.priceTypeName ?? "").trim(),
          currency: p.currency ? String(p.currency) : undefined,
        })),
      promotions: (promos?.body?.promo ?? [])
        .filter((p) => p.promoID)
        .map((p) => ({
          id: Number(p.promoID),
          name: String(p.promoName ?? "").trim(),
          type: p.promoType ? String(p.promoType) : undefined,
          description: stripHtml(p.shortDescription) || undefined,
        })),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "supplier request failed" };
  }
}

/** Lightweight reachability probe used by the admin connector panel. */
export async function aktgHealth(): Promise<{ ok: boolean; message: string }> {
  if (!aktgConfigured()) return { ok: false, message: "CRYSTAL_AKTG_API_KEY is not configured." };
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
