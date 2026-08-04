// Catalogue query engine — the single source of truth behind every collection page.
// Products come from the Worldway product registry; supplier availability is resolved
// against the live supplier registry (PRODUCT_REGISTRY) before anything is returned.
import {
  collectionItems,
  collectionsMeta,
  type CollectionKind,
  type CollectionItem,
} from "./collections";
import type {
  CatalogueFacets,
  CatalogueFilters,
  CatalogueProduct,
  CatalogueQueryResult,
  SortKey,
  SupplierStatus,
} from "./catalogue-types";

const MONTHS = [
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

// kind -> supplier registry key
const SUPPLIER_KEY: Partial<Record<CollectionKind, string>> = {
  flights: "flights",
  hotels: "hotels",
  activities: "activities",
  transfers: "transfers",
  aviation: "privateJets",
  cruises: "cruises",
  "cruises-expedition": "cruises",
  "cruises-river": "cruises",
  "cruises-world": "cruises",
  rail: "rail",
  villas: "villas",
  yachts: "yachts",
  insurance: "insurance",
  visa: "visa",
};

const SUPPLIER_NOTE: Record<SupplierStatus, string | null> = {
  live: null,
  "on-request":
    "Live supplier availability for this collection is confirmed by a specialist within 24 hours of your enquiry.",
};

const STYLE_BY_KIND: Partial<Record<CollectionKind, string[]>> = {
  cruises: ["Cruise", "All-inclusive"],
  "cruises-expedition": ["Expedition", "Adventure"],
  "cruises-river": ["Cruise", "Cultural"],
  "cruises-world": ["Cruise", "Grand voyage"],
  rail: ["Rail", "Slow travel"],
  aviation: ["Private aviation"],
  tours: ["Escorted", "Cultural"],
  "small-group": ["Small group"],
  "tailor-made": ["Tailor-made", "Private"],
  safari: ["Safari", "Wildlife"],
  polar: ["Expedition", "Wildlife"],
  cultural: ["Cultural", "Heritage"],
  honeymoon: ["Romance"],
  wellness: ["Wellness"],
  family: ["Family"],
  flights: ["Air travel"],
  hotels: ["Stay"],
  activities: ["Experience"],
  transfers: ["Ground"],
  villas: ["Private", "Stay"],
  yachts: ["Charter", "Private"],
  insurance: ["Protection"],
  visa: ["Documentation"],
};

const INTEREST_RULES: { interest: string; test: RegExp }[] = [
  {
    interest: "Wildlife",
    test: /wildlife|safari|big five|penguin|polar bear|whale|bird|gorilla|tiger/i,
  },
  { interest: "Culinary", test: /dining|chef|michelin|wine|cuisine|culinary|tasting|sommelier/i },
  { interest: "Wellness", test: /spa|wellness|yoga|ayurved|retreat|detox|thermal/i },
  { interest: "Adventure", test: /zodiac|kayak|trek|hik|dive|snorkel|expedition|heli-ski|climb/i },
  {
    interest: "Culture & heritage",
    test: /temple|museum|heritage|history|palace|archaeolog|ancient|art/i,
  },
  { interest: "Beach & islands", test: /beach|island|reef|lagoon|coast|atoll/i },
  { interest: "Romance", test: /honeymoon|romantic|couple|private dinner|sunset/i },
  { interest: "Family", test: /family|kids|children|teen/i },
  { interest: "Rail journeys", test: /rail|train|carriage|cabin suite/i },
  { interest: "Yachting", test: /yacht|charter|sail|catamaran/i },
];

function parseNights(item: CollectionItem): number | null {
  const src = `${item.duration ?? ""} ${item.subtitle}`;
  const m = src.match(/(\d+)\s*(night|day)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toLowerCase() === "day" ? Math.max(1, n - 1) : n;
}

function luxuryLevel(price?: number): CatalogueProduct["luxuryLevel"] {
  if (price == null) return "luxury";
  if (price >= 25000) return "ultra-luxury";
  if (price >= 6000) return "luxury";
  return "premium";
}

function groupSize(kind: CollectionKind, item: CollectionItem): CatalogueProduct["groupSize"] {
  if (kind === "small-group") return "small-group";
  if (["tailor-made", "villas", "yachts", "aviation", "transfers", "honeymoon"].includes(kind))
    return "private";
  const cap = item.capacity?.match(/(\d[\d,]*)/);
  if (cap) {
    const n = Number(cap[1].replace(/,/g, ""));
    if (n <= 24) return "small-group";
    if (n <= 12) return "private";
  }
  return "flexible";
}

function countryOf(item: CollectionItem): string {
  return item.location.split(/[,–—]/)[0].trim();
}

function textOf(item: CollectionItem): string {
  return [
    item.title,
    item.subtitle,
    item.location,
    item.operator,
    ...(item.highlights ?? []),
    ...(item.inclusions ?? []),
    ...(item.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function supplierStatusFor(kind: CollectionKind): SupplierStatus {
  const key = SUPPLIER_KEY[kind];
  if (!key) return "on-request";
  // Lazily read the supplier registry to avoid a hard import cycle.
  const registry = REGISTRY_STATUS();
  return registry[key] === "live" ? "live" : "on-request";
}

let registryCache: Record<string, string> | null = null;
function REGISTRY_STATUS(): Record<string, string> {
  if (registryCache) return registryCache;

  const out: Record<string, string> = {};
  for (const p of SUPPLIER_REGISTRY) out[p.key] = p.status;
  registryCache = out;
  return out;
}

// Mirrors the live supplier registry status without importing the server-function module.
const SUPPLIER_REGISTRY: ReadonlyArray<{ key: string; status: "live" | "dormant" }> = [
  { key: "flights", status: "live" },
  { key: "hotels", status: "live" },
  { key: "activities", status: "live" },
  { key: "transfers", status: "live" },
  { key: "buses", status: "live" },
  { key: "privateJets", status: "live" },
  { key: "tripBuilder", status: "live" },
  { key: "concierge", status: "live" },
  { key: "cruises", status: "dormant" },
  { key: "rail", status: "dormant" },
  { key: "carRental", status: "dormant" },
  { key: "villas", status: "dormant" },
  { key: "yachts", status: "dormant" },
  { key: "visa", status: "dormant" },
  { key: "insurance", status: "dormant" },
];

function enrich(kind: CollectionKind, item: CollectionItem): CatalogueProduct {
  const meta = collectionsMeta[kind];
  const blob = textOf(item);
  const interests = INTEREST_RULES.filter((r) => r.test.test(blob)).map((r) => r.interest);
  const nights = parseNights(item);
  const months = (item.tags ?? []).filter((t) => MONTHS.includes(t));
  return {
    ...item,
    kind,
    collectionTitle: meta.title,
    detailBase: meta.detailBasePath,
    supplier: item.operator ?? meta.title,
    supplierStatus: supplierStatusFor(kind),
    rating: item.featured ? 4.9 : 4.7,
    reviewCount: 0,
    luxuryLevel: luxuryLevel(item.priceFrom),
    travelStyles: STYLE_BY_KIND[kind] ?? [meta.title],
    interests,
    durationNights: nights,
    familyFriendly: kind === "family" || /family|children|kids/i.test(blob),
    accessible: !/trek|hik|zodiac|climb|expedition|heli-ski/i.test(blob),
    groupSize: groupSize(kind, item),
    departureMonths: months.length ? months : MONTHS,
    country: countryOf(item),
  };
}

let indexCache: CatalogueProduct[] | null = null;
export function catalogueIndex(): CatalogueProduct[] {
  if (indexCache) return indexCache;
  const all: CatalogueProduct[] = [];
  for (const kind of Object.keys(collectionItems) as CollectionKind[]) {
    for (const item of collectionItems[kind]) all.push(enrich(kind, item));
  }
  indexCache = all;
  return all;
}

function tokenScore(product: CatalogueProduct, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return 1;
  const tokens = query.split(/\s+/).filter(Boolean);
  const haystack = [
    product.title,
    product.subtitle,
    product.location,
    product.country,
    product.region ?? "",
    product.collectionTitle,
    product.supplier,
    ...product.travelStyles,
    ...product.interests,
    ...(product.highlights ?? []),
    ...(product.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (product.title.toLowerCase().includes(t)) score += 6;
    else if (product.location.toLowerCase().includes(t)) score += 4;
    else if (haystack.includes(t)) score += 2;
  }
  return tokens.length && score === 0 ? 0 : score + (product.featured ? 1 : 0);
}

function matches(p: CatalogueProduct, f: CatalogueFilters): boolean {
  if (f.destination && p.location !== f.destination) return false;
  if (f.country && p.country !== f.country) return false;
  if (f.region && p.region !== f.region) return false;
  if (f.travelStyle && !p.travelStyles.includes(f.travelStyle)) return false;
  if (f.interest && !p.interests.includes(f.interest)) return false;
  if (f.theme && !p.interests.includes(f.theme) && !p.travelStyles.includes(f.theme)) return false;
  if (f.supplier && p.supplier !== f.supplier) return false;
  if (f.luxuryLevel && p.luxuryLevel !== f.luxuryLevel) return false;
  if (f.groupSize && p.groupSize !== f.groupSize) return false;
  if (f.departureMonth && !p.departureMonths.includes(f.departureMonth)) return false;
  if (f.familyFriendly && !p.familyFriendly) return false;
  if (f.accessible && !p.accessible) return false;
  if (f.availableOnly && p.supplierStatus !== "live") return false;
  if (f.minRating != null && p.rating < f.minRating) return false;
  if (f.priceMin != null && (p.priceFrom ?? 0) < f.priceMin) return false;
  if (f.priceMax != null && p.priceFrom != null && p.priceFrom > f.priceMax) return false;
  if (f.durationMin != null && (p.durationNights ?? 0) < f.durationMin) return false;
  if (f.durationMax != null && p.durationNights != null && p.durationNights > f.durationMax)
    return false;
  return true;
}

function sortItems(items: CatalogueProduct[], sort: SortKey, q?: string): CatalogueProduct[] {
  const out = [...items];
  switch (sort) {
    case "price-asc":
      return out.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
    case "price-desc":
      return out.sort((a, b) => (b.priceFrom ?? -1) - (a.priceFrom ?? -1));
    case "duration-asc":
      return out.sort((a, b) => (a.durationNights ?? Infinity) - (b.durationNights ?? Infinity));
    case "duration-desc":
      return out.sort((a, b) => (b.durationNights ?? -1) - (a.durationNights ?? -1));
    case "rating-desc":
      return out.sort((a, b) => b.rating - a.rating);
    case "title-asc":
      return out.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return out.sort((a, b) => {
        if (q) {
          const d = tokenScore(b, q) - tokenScore(a, q);
          if (d !== 0) return d;
        }
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (a.supplierStatus !== b.supplierStatus) return a.supplierStatus === "live" ? -1 : 1;
        return (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity);
      });
  }
}

function buildFacets(items: CatalogueProduct[]): CatalogueFacets {
  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
  const prices = items.map((i) => i.priceFrom).filter((n): n is number => n != null);
  const durations = items.map((i) => i.durationNights).filter((n): n is number => n != null);
  return {
    destinations: uniq(items.map((i) => i.location)),
    countries: uniq(items.map((i) => i.country)),
    regions: uniq(items.map((i) => i.region ?? "")),
    travelStyles: uniq(items.flatMap((i) => i.travelStyles)),
    interests: uniq(items.flatMap((i) => i.interests)),
    suppliers: uniq(items.map((i) => i.supplier)),
    luxuryLevels: uniq(items.map((i) => i.luxuryLevel)),
    groupSizes: uniq(items.map((i) => i.groupSize)),
    departureMonths: MONTHS,
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
    durationRange: {
      min: durations.length ? Math.min(...durations) : 0,
      max: durations.length ? Math.max(...durations) : 0,
    },
  };
}

export interface QueryInput extends CatalogueFilters {
  kind?: CollectionKind;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export function queryCatalogue(input: QueryInput): CatalogueQueryResult {
  const { kind, sort = "recommended", page = 1, pageSize = 12, ...filters } = input;
  const scope = kind ? catalogueIndex().filter((p) => p.kind === kind) : catalogueIndex();
  const facets = buildFacets(scope);

  let filtered = scope.filter((p) => matches(p, filters));
  if (filters.q) filtered = filtered.filter((p) => tokenScore(p, filters.q!) > 0);

  const sorted = sortItems(filtered, sort, filters.q);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const items = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const status: SupplierStatus = kind ? supplierStatusFor(kind) : "live";

  return {
    items,
    total,
    page: safePage,
    pageSize,
    pageCount,
    facets,
    featured: scope.filter((p) => p.featured).slice(0, 3),
    supplierStatus: status,
    supplierNote: SUPPLIER_NOTE[status],
  };
}

export function getCatalogueProductBySlug(
  kind: CollectionKind,
  slug: string,
): CatalogueProduct | null {
  return catalogueIndex().find((p) => p.kind === kind && p.slug === slug) ?? null;
}

export function relatedProducts(product: CatalogueProduct, limit = 3): CatalogueProduct[] {
  const pool = catalogueIndex().filter(
    (p) => !(p.kind === product.kind && p.slug === product.slug),
  );
  const scored = pool.map((p) => {
    let s = 0;
    if (p.kind === product.kind) s += 4;
    if (p.region && p.region === product.region) s += 3;
    if (p.country === product.country) s += 3;
    s += p.interests.filter((i) => product.interests.includes(i)).length * 2;
    if (p.luxuryLevel === product.luxuryLevel) s += 1;
    return { p, s };
  });
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

export interface GlobalSearchGroup {
  kind: CollectionKind;
  title: string;
  basePath: string;
  items: CatalogueProduct[];
  total: number;
}

export function globalSearch(q: string, limit = 24) {
  const index = catalogueIndex();
  const scored = index
    .map((p) => ({ p, s: tokenScore(p, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  const groups = new Map<CollectionKind, GlobalSearchGroup>();
  for (const { p } of scored) {
    let g = groups.get(p.kind);
    if (!g) {
      g = { kind: p.kind, title: p.collectionTitle, basePath: p.detailBase, items: [], total: 0 };
      groups.set(p.kind, g);
    }
    g.total += 1;
    if (g.items.length < 4) g.items.push(p);
  }

  const lower = q.trim().toLowerCase();
  const destinations = Array.from(new Set(index.map((p) => p.location)))
    .filter((d) => !lower || d.toLowerCase().includes(lower))
    .slice(0, 8);
  const countries = Array.from(new Set(index.map((p) => p.country)))
    .filter((c) => !lower || c.toLowerCase().includes(lower))
    .slice(0, 8);
  const collections = Object.values(collectionsMeta)
    .filter(
      (m) =>
        !lower || m.title.toLowerCase().includes(lower) || m.intro.toLowerCase().includes(lower),
    )
    .slice(0, 8)
    .map((m) => ({ slug: m.slug, title: m.title, path: m.detailBasePath }));

  return {
    query: q,
    total: scored.length,
    products: scored.slice(0, limit).map((x) => x.p),
    groups: Array.from(groups.values()),
    destinations,
    countries,
    collections,
  };
}

export function searchSuggestions(q: string, limit = 8): string[] {
  const lower = q.trim().toLowerCase();
  const index = catalogueIndex();
  const pool = [
    ...index.map((p) => p.location),
    ...index.map((p) => p.country),
    ...index.flatMap((p) => p.interests),
    ...Object.values(collectionsMeta).map((m) => m.title),
  ];
  const uniq = Array.from(new Set(pool.filter(Boolean)));
  if (!lower) return uniq.slice(0, limit);
  return uniq.filter((s) => s.toLowerCase().includes(lower)).slice(0, limit);
}

export const POPULAR_SEARCHES = [
  "Antarctica",
  "Maldives",
  "Safari",
  "Japan",
  "Mediterranean cruise",
  "Private jet",
  "Honeymoon",
  "Villas in Italy",
];
