// Server-only taxonomy + deals service for the guided-tour supplier.
// Every value here comes from the supplier's licensed REST API
// (countries, continents, tour_categories, promotions) — nothing is scraped.
import { gFetch, toursConfigured } from "./tours.server";

export type TaxonomyEntry = { id: string; name: string; count: number | null; description?: string };

export type TourTaxonomy = {
  configured: boolean;
  countsReady: boolean;
  regions: TaxonomyEntry[];
  countries: TaxonomyEntry[];
  travelStyles: TaxonomyEntry[];
  interests: TaxonomyEntry[];
  serviceLevels: TaxonomyEntry[];
  physicalGrading: TaxonomyEntry[];
};

type ListRes<T> = { count?: number; results?: T[]; links?: { rel?: string }[] };
type RawCategory = {
  id?: string;
  name?: string;
  description?: string;
  category_type?: { name?: string } | null;
};
type RawNamed = { id?: string; name?: string };

async function listAll<T>(path: string, maxPages = 12): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await gFetch<ListRes<T>>(`${path}${sep}max_per_page=50&page=${page}`);
    if (!res.ok || !res.data) break;
    const batch = res.data.results ?? [];
    out.push(...batch);
    if (batch.length < 50) break;
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

/** How many tour dossiers match one supplier filter. */
async function countFor(filter: string, value: string): Promise<number> {
  const res = await gFetch<ListRes<unknown>>(
    `/tour_dossiers?${filter}=${encodeURIComponent(value)}&max_per_page=1`,
  );
  return res.ok ? (res.data?.count ?? 0) : 0;
}

let cache: TourTaxonomy | null = null;
let cachedAt = 0;
let enriching = false;
const TTL = 12 * 60 * 60 * 1000;

async function buildBase(): Promise<TourTaxonomy> {
  const [continents, countries, categories] = await Promise.all([
    listAll<RawNamed>("/continents", 1),
    listAll<RawNamed>("/countries", 8),
    listAll<RawCategory>("/tour_categories", 4),
  ]);

  const byType = (...types: string[]): TaxonomyEntry[] =>
    categories
      .filter((c) => types.includes(c.category_type?.name ?? "") && c.name)
      .map((c) => ({
        id: String(c.id ?? c.name),
        name: c.name!,
        description: c.description ?? undefined,
        count: null,
      }))
      .filter(
        (e, i, all) => all.findIndex((o) => o.name.toLowerCase() === e.name.toLowerCase()) === i,
      )
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    configured: true,
    countsReady: false,
    regions: continents
      .filter((c) => c.name)
      .map((c) => ({ id: String(c.id ?? c.name), name: c.name!, count: null })),
    countries: countries
      .filter((c) => c.name)
      .map((c) => ({ id: String(c.id ?? c.name), name: c.name!, count: null })),
    travelStyles: byType("Travel Style"),
    // Dossiers are only tagged with trip-type and merchandising categories, so
    // those are the interest facets that actually return bookable product.
    interests: byType("Trip Type", "Merchandising", "Activity", "Holiday Type"),
    serviceLevels: byType("Service Level"),
    physicalGrading: byType("Physical Grading"),
  };
}

/** Adds live dossier counts and drops taxonomy values with no bookable product. */
async function enrich(base: TourTaxonomy) {
  const withCounts = async (entries: TaxonomyEntry[], filter: string) =>
    (await mapLimit(entries, 20, async (e) => ({ ...e, count: await countFor(filter, e.name) })))
      .filter((e) => (e.count ?? 0) > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const [regions, countries, travelStyles, interests, serviceLevels, physicalGrading] =
    await Promise.all([
      withCounts(base.regions, "geography.region.name"),
      withCounts(base.countries, "geography.visited_countries.name"),
      withCounts(base.travelStyles, "categories.name"),
      withCounts(base.interests, "categories.name"),
      withCounts(base.serviceLevels, "categories.name"),
      withCounts(base.physicalGrading, "categories.name"),
    ]);

  cache = {
    ...base,
    countsReady: true,
    regions,
    countries,
    travelStyles,
    interests,
    serviceLevels,
    physicalGrading: physicalGrading.sort((a, b) => a.name.localeCompare(b.name)),
  };
  cachedAt = Date.now();
}

export async function getTaxonomy(): Promise<TourTaxonomy> {
  if (!toursConfigured()) {
    return {
      configured: false,
      countsReady: false,
      regions: [],
      countries: [],
      travelStyles: [],
      interests: [],
      serviceLevels: [],
      physicalGrading: [],
    };
  }
  if (cache && Date.now() - cachedAt < TTL) return cache;
  const base = cache ?? (await buildBase());
  if (!cache) {
    cache = base;
    cachedAt = Date.now();
  }
  if (!enriching && !base.countsReady) {
    enriching = true;
    void enrich(base)
      .catch(() => undefined)
      .finally(() => {
        enriching = false;
      });
  }
  return cache;
}

// ---------------------------------------------------------------- deals

export type TourDeal = {
  id: string;
  name: string;
  discountPercent: number | null;
  discountAmount: number | null;
  promotionCode: string;
  saleFinishDate: string | null;
  departureDate: string | null;
  tourId: string | null;
  tourName: string | null;
  image: string | null;
};

type RawPromotion = {
  id?: string;
  name?: string;
  promotion_code?: string;
  discount_percent?: string | null;
  discount_amount?: string | null;
  sale_start_date?: string | null;
  sale_finish_date?: string | null;
  product_start_date?: string | null;
  flags?: string[];
  products?: { id?: string; type?: string }[];
};

let dealsCache: { at: number; deals: TourDeal[] } | null = null;
const DEALS_TTL = 30 * 60 * 1000;

export async function getTourDeals(limit = 12): Promise<{
  ok: boolean;
  configured: boolean;
  deals: TourDeal[];
  error?: string;
}> {
  if (!toursConfigured()) return { ok: false, configured: false, deals: [] };
  if (dealsCache && Date.now() - dealsCache.at < DEALS_TTL)
    return { ok: true, configured: true, deals: dealsCache.deals.slice(0, limit) };

  // The list endpoint returns thin records (id/name only) — each promotion has
  // to be hydrated before its flags, discount and sale window are visible.
  const res = await gFetch<ListRes<RawPromotion>>(
    "/promotions?order_by=-date_created&max_per_page=50",
  );
  if (!res.ok) return { ok: false, configured: true, deals: [], error: res.error };

  const today = new Date().toISOString().slice(0, 10);
  const hydrated = await mapLimit(
    (res.data?.results ?? []).slice(0, 40),
    10,
    async (p) => {
      const detail = await gFetch<RawPromotion>(`/promotions/${encodeURIComponent(String(p.id))}`);
      return detail.ok && detail.data ? detail.data : null;
    },
  );
  const active = (hydrated.filter(Boolean) as RawPromotion[])
    .filter((p) => (p.flags ?? []).includes("ACTIVE"))
    .filter((p) => !p.sale_finish_date || p.sale_finish_date >= today)
    .filter((p) => !p.product_start_date || p.product_start_date >= today)
    .slice(0, limit * 2);

  const resolved = await mapLimit(active, 8, async (p): Promise<TourDeal | null> => {
    const departureId = p.products?.find((x) => x.type === "departures")?.id;
    let tourId: string | null = null;
    let tourName: string | null = null;
    let departureDate: string | null = null;
    let image: string | null = null;
    if (departureId) {
      const dep = await gFetch<{
        start_date?: string;
        tour_dossier?: { id?: string; name?: string };
      }>(`/departures/${encodeURIComponent(departureId)}`);
      tourId = dep.data?.tour_dossier?.id ? String(dep.data.tour_dossier.id) : null;
      tourName = dep.data?.tour_dossier?.name ?? null;
      departureDate = dep.data?.start_date ?? null;
      if (tourId) {
        const dossier = await gFetch<{ images?: { type?: string; image_href?: string }[] }>(
          `/tour_dossiers/${tourId}`,
        );
        const images = dossier.data?.images ?? [];
        image =
          images.find((i) => i.type === "BANNER_HIRES")?.image_href ??
          images.find((i) => i.type === "BANNER")?.image_href ??
          null;
      }
    }
    if (!tourId) return null;
    return {
      id: String(p.id ?? ""),
      name: p.name ?? "Limited-time offer",
      discountPercent: p.discount_percent ? Number(p.discount_percent) : null,
      discountAmount: p.discount_amount ? Number(p.discount_amount) : null,
      promotionCode: p.promotion_code ?? "",
      saleFinishDate: p.sale_finish_date ?? null,
      departureDate,
      tourId,
      tourName,
      image,
    };
  });

  const deals = (resolved.filter(Boolean) as TourDeal[]).sort(
    (a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
  );
  if (deals.length) dealsCache = { at: Date.now(), deals };
  return { ok: true, configured: true, deals: deals.slice(0, limit) };
}
