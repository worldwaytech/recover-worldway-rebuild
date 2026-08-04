// Licensed-inventory gate + search engine for the Crystal Cruises module.
// `licensedVoyages()` is the ONLY source of voyages the UI will render. It is
// empty until an authorised Crystal feed (partner API, XML/JSON distribution
// file or signed push) is connected, at which point the connector runtime
// normalises records into CrystalVoyage and every surface fills automatically.
import { CRYSTAL_DESTINATIONS, CRYSTAL_LICENCE_NOTICE, CRYSTAL_SHIPS } from "./content";
import type {
  CrystalFacetBucket,
  CrystalSearchFilters,
  CrystalSearchResult,
  CrystalVoyage,
  CruiseStyle,
  SuiteCategory,
} from "./types";

/** Populated at runtime by the connector once licensed data is ingested. */
let LICENSED: CrystalVoyage[] = [];

export function licensedVoyages(): CrystalVoyage[] {
  return LICENSED;
}

export function isLicensedInventoryAvailable(): boolean {
  return LICENSED.length > 0;
}

/** Connector entry point — rejects anything not marked as licensed. */
export function setLicensedVoyages(voyages: CrystalVoyage[]): number {
  LICENSED = voyages.filter((v) => v.dataSource === "licensed");
  return LICENSED.length;
}

export function voyageByCode(code: string): CrystalVoyage | null {
  return LICENSED.find((v) => v.code.toLowerCase() === code.toLowerCase()) ?? null;
}

export const SUITE_CATEGORIES: { value: SuiteCategory; label: string }[] = [
  { value: "ocean-view", label: "Ocean View" },
  { value: "balcony", label: "Balcony / Veranda" },
  { value: "penthouse", label: "Penthouse" },
  { value: "residence", label: "Residence" },
  { value: "expedition-suite", label: "Expedition Suite" },
];

export const CRUISE_STYLES: { value: CruiseStyle; label: string }[] = [
  { value: "ocean", label: "Ocean" },
  { value: "expedition", label: "Expedition" },
  { value: "world-cruise", label: "World Cruise" },
  { value: "grand-voyage", label: "Grand Voyage" },
  { value: "wellness", label: "Wellness" },
  { value: "culinary", label: "Culinary" },
  { value: "cultural", label: "Cultural" },
  { value: "holiday", label: "Holiday Cruises" },
  { value: "family", label: "Family Friendly" },
  { value: "adults-only", label: "Adults Only" },
  { value: "solo", label: "Solo Traveller" },
];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const LENGTH_BANDS = [
  { label: "Up to 7 nights", min: 1, max: 7 },
  { label: "8–13 nights", min: 8, max: 13 },
  { label: "14–20 nights", min: 14, max: 20 },
  { label: "21+ nights", min: 21, max: 400 },
];

/* ---------------------------------- search --------------------------------- */

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau-lite edit distance capped at 2 — powers typo tolerance. */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  if (a.length < 4 || b.length < 4) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] <= 2;
}

function haystack(v: CrystalVoyage): string {
  return norm(
    [
      v.title,
      v.subtitle,
      v.shipName,
      v.destinationName,
      v.region,
      v.embarkPort,
      v.disembarkPort,
      v.countries.join(" "),
      v.styles.join(" "),
      v.itinerary.map((d) => d.port).join(" "),
    ].join(" "),
  );
}

function textScore(v: CrystalVoyage, q: string): number {
  const hay = haystack(v);
  const tokens = norm(q).split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  const words = hay.split(" ");
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 3;
    else if (words.some((w) => close(w, t))) score += 1.5;
  }
  return score / tokens.length;
}

/** Natural-language query → structured filters (semantic intent extraction). */
export function parseNaturalLanguage(input: string): CrystalSearchFilters {
  const q = norm(input);
  const f: CrystalSearchFilters = {};
  for (const d of CRYSTAL_DESTINATIONS) {
    if (q.includes(norm(d.name)) || d.countries.some((c) => q.includes(norm(c)))) {
      f.destination = d.slug;
      break;
    }
  }
  for (const s of CRYSTAL_SHIPS) if (q.includes(norm(s.name))) f.ship = s.slug;
  const month = MONTHS.find((m) => q.includes(norm(m)));
  if (month) f.month = month;
  const under = q.match(/(?:under|less than|fewer than|up to)\s+(\d{1,3})\s*(night|day)/);
  if (under) f.maxNights = Number(under[1]);
  const over = q.match(/(?:over|more than|at least)\s+(\d{1,3})\s*(night|day)/);
  if (over) f.minNights = Number(over[1]);
  const budget = q.match(/(?:under|below|less than)\s*(?:usd|\$)?\s*(\d{3,7})/);
  if (budget && !under) f.maxPrice = Number(budget[1]);
  for (const s of SUITE_CATEGORIES) {
    if (q.includes(norm(s.label.split(" /")[0])) || q.includes(norm(s.value.replace(/-/g, " ")))) {
      f.suite = s.value;
      break;
    }
  }
  for (const s of CRUISE_STYLES) {
    if (q.includes(norm(s.label)) || q.includes(norm(s.value.replace(/-/g, " ")))) {
      f.style = s.value;
      break;
    }
  }
  if (/\bsolo\b/.test(q)) f.style = "solo";
  if (/\bworld cruise\b/.test(q)) f.style = "world-cruise";
  const residual = input
    .replace(/\b(i want|show me|show|find|looking for|a|an|the|cruise|cruises|please)\b/gi, " ")
    .trim();
  if (!f.destination && !f.ship && residual.length > 2) f.q = residual;
  return f;
}

function monthOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : MONTHS[d.getUTCMonth()];
}

function matches(v: CrystalVoyage, f: CrystalSearchFilters): boolean {
  if (f.destination && v.destinationSlug !== f.destination) return false;
  if (f.region && norm(v.region) !== norm(f.region)) return false;
  if (f.country && !v.countries.some((c) => norm(c) === norm(f.country!))) return false;
  if (f.ship && v.shipSlug !== f.ship) return false;
  if (f.port && !v.itinerary.some((d) => norm(d.port) === norm(f.port!))) return false;
  if (f.embarkPort && norm(v.embarkPort) !== norm(f.embarkPort)) return false;
  if (f.disembarkPort && norm(v.disembarkPort) !== norm(f.disembarkPort)) return false;
  if (f.minNights && v.nights < f.minNights) return false;
  if (f.maxNights && v.nights > f.maxNights) return false;
  if (f.month && monthOf(v.departureDate) !== f.month) return false;
  if (f.date && !v.departureDate.startsWith(f.date)) return false;
  if (f.minPrice && (v.priceFrom ?? 0) < f.minPrice) return false;
  if (f.maxPrice && (v.priceFrom ?? Infinity) > f.maxPrice) return false;
  if (f.suite && !v.fares.some((fare) => fare.suiteCategory === f.suite)) return false;
  if (f.style && !v.styles.includes(f.style)) return false;
  if (f.availability && v.availability !== f.availability) return false;
  if (f.promotionsOnly && v.promotions.length === 0) return false;
  if (f.q && textScore(v, f.q) < 1) return false;
  return true;
}

function bucket(
  rows: CrystalVoyage[],
  key: (v: CrystalVoyage) => { value: string; label: string }[],
): CrystalFacetBucket[] {
  const map = new Map<string, CrystalFacetBucket>();
  for (const v of rows) {
    for (const { value, label } of key(v)) {
      if (!value) continue;
      const hit = map.get(value);
      if (hit) hit.count += 1;
      else map.set(value, { value, label, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function searchVoyages(filters: CrystalSearchFilters = {}): CrystalSearchResult {
  const all = licensedVoyages();
  const rows = all.filter((v) => matches(v, filters));
  const sort = filters.sort ?? "recommended";
  rows.sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity);
      case "price-desc":
        return (b.priceFrom ?? 0) - (a.priceFrom ?? 0);
      case "nights-asc":
        return a.nights - b.nights;
      case "nights-desc":
        return b.nights - a.nights;
      case "date-asc":
        return a.departureDate.localeCompare(b.departureDate);
      default:
        return filters.q
          ? textScore(b, filters.q) - textScore(a, filters.q)
          : a.departureDate.localeCompare(b.departureDate);
    }
  });
  return {
    voyages: rows,
    total: rows.length,
    facets: {
      destination: bucket(rows, (v) => [{ value: v.destinationSlug, label: v.destinationName }]),
      region: bucket(rows, (v) => [{ value: v.region, label: v.region }]),
      country: bucket(rows, (v) => v.countries.map((c) => ({ value: c, label: c }))),
      port: bucket(rows, (v) => v.itinerary.map((d) => ({ value: d.port, label: d.port }))),
      ship: bucket(rows, (v) => [{ value: v.shipSlug, label: v.shipName }]),
      month: bucket(rows, (v) => [
        { value: monthOf(v.departureDate), label: monthOf(v.departureDate) },
      ]),
      suite: bucket(rows, (v) =>
        v.fares.map((f) => ({
          value: f.suiteCategory,
          label:
            SUITE_CATEGORIES.find((s) => s.value === f.suiteCategory)?.label ?? f.suiteCategory,
        })),
      ),
      style: bucket(rows, (v) =>
        v.styles.map((s) => ({
          value: s,
          label: CRUISE_STYLES.find((c) => c.value === s)?.label ?? s,
        })),
      ),
      availability: bucket(rows, (v) => [{ value: v.availability, label: v.availability }]),
    },
    licensed: all.length > 0,
    notice: all.length > 0 ? "" : CRYSTAL_LICENCE_NOTICE,
  };
}

export function voyagesForDestination(slug: string): CrystalVoyage[] {
  return licensedVoyages().filter((v) => v.destinationSlug === slug);
}

export function voyagesForShip(slug: string): CrystalVoyage[] {
  return licensedVoyages().filter((v) => v.shipSlug === slug);
}

export function voyagesForPort(name: string): CrystalVoyage[] {
  const n = norm(name);
  return licensedVoyages().filter((v) => v.itinerary.some((d) => norm(d.port) === n));
}

export function relatedVoyages(v: CrystalVoyage, limit = 3): CrystalVoyage[] {
  return licensedVoyages()
    .filter((x) => x.code !== v.code)
    .sort((a, b) => {
      const s = (x: CrystalVoyage) =>
        (x.destinationSlug === v.destinationSlug ? 2 : 0) + (x.shipSlug === v.shipSlug ? 1 : 0);
      return s(b) - s(a);
    })
    .slice(0, limit);
}

export function formatFare(v: CrystalVoyage): string {
  if (!v.priceFrom) return "On request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: v.currency || "USD",
    maximumFractionDigits: 0,
  }).format(v.priceFrom);
}
