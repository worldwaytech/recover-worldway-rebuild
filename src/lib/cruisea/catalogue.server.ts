import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  durationMatches,
  type CruiseaAvailability,
  type CruiseaCabin,
  type CruiseaFacets,
  type CruiseaFilters,
  type CruiseaSailing,
  type CruiseaSailingDetail,
  type CruiseaSailingSummary,
} from "./types";

type SailingRow = Database["public"]["Tables"]["cruisea_sailings"]["Row"];
type CabinRow = Database["public"]["Tables"]["cruisea_cabins"]["Row"];

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function mapSailing(row: SailingRow): CruiseaSailing {
  return {
    id: row.id,
    title: row.title,
    cruiseLine: row.cruise_line,
    shipName: row.ship_name,
    cruiseType: row.cruise_type,
    region: row.region,
    country: row.country,
    embarkationPort: row.embarkation_port,
    disembarkationPort: row.disembarkation_port,
    departureDate: row.departure_date,
    durationNights: row.duration_nights,
    description: row.description,
    highlights: row.highlights ?? [],
    imageUrl: row.image_url,
    areaTags: row.area_tags ?? [],
    packageOptions: row.package_options ?? [],
  };
}

function mapCabin(row: CabinRow): CruiseaCabin {
  return {
    id: row.id,
    sailingId: row.sailing_id,
    category: row.category,
    label: row.label,
    pricePerGuest: Number(row.price_per_guest),
    availableInventory: row.available_inventory,
  };
}

async function loadCatalogue(): Promise<{ sailings: CruiseaSailing[]; cabins: CruiseaCabin[] }> {
  const supabase = publicClient();
  const [sailingsRes, cabinsRes] = await Promise.all([
    supabase.from("cruisea_sailings").select("*").order("departure_date", { ascending: true }),
    supabase.from("cruisea_cabins").select("*").order("price_per_guest", { ascending: true }),
  ]);
  if (sailingsRes.error) throw new Error(sailingsRes.error.message);
  if (cabinsRes.error) throw new Error(cabinsRes.error.message);
  return {
    sailings: (sailingsRes.data ?? []).map(mapSailing),
    cabins: (cabinsRes.data ?? []).map(mapCabin),
  };
}

function summarise(sailing: CruiseaSailing, cabins: CruiseaCabin[]): CruiseaSailingSummary {
  const own = cabins.filter((c) => c.sailingId === sailing.id);
  const prices = own.map((c) => c.pricePerGuest);
  return {
    ...sailing,
    fromPrice: prices.length ? Math.min(...prices) : null,
    cabinCount: own.length,
    cabinCategories: [...new Set(own.map((c) => c.category))],
    totalInventory: own.reduce((sum, c) => sum + c.availableInventory, 0),
  };
}

function matches(summary: CruiseaSailingSummary, f: CruiseaFilters): boolean {
  if (f.query) {
    const needle = f.query.trim().toLowerCase();
    const haystack = [
      summary.title,
      summary.cruiseLine,
      summary.shipName,
      summary.region,
      summary.country,
      summary.embarkationPort,
      summary.disembarkationPort,
      summary.description,
      ...summary.highlights,
      ...summary.areaTags,
    ]
      .join(" ")
      .toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
  }
  if (f.cruiseType && summary.cruiseType !== f.cruiseType) return false;
  if (f.region && summary.region !== f.region) return false;
  if (f.country && summary.country !== f.country) return false;
  if (f.company && summary.cruiseLine !== f.company) return false;
  if (f.ship && summary.shipName !== f.ship) return false;
  if (f.embarkationPort && summary.embarkationPort !== f.embarkationPort) return false;
  if (!durationMatches(summary.durationNights, f.duration)) return false;
  if (f.departureDate && summary.departureDate !== f.departureDate) return false;
  if (f.departureMonth && !summary.departureDate.startsWith(f.departureMonth)) return false;
  if (f.areaTag && !summary.areaTags.includes(f.areaTag)) return false;
  if (f.cabinCategory && !summary.cabinCategories.includes(f.cabinCategory)) return false;
  if (f.packageOptions?.length) {
    const all = f.packageOptions.every((option) => summary.packageOptions.includes(option));
    if (!all) return false;
  }
  if (f.minPrice !== undefined && (summary.fromPrice ?? 0) < f.minPrice) return false;
  if (f.maxPrice !== undefined && (summary.fromPrice ?? 0) > f.maxPrice) return false;
  if (f.guests !== undefined && summary.totalInventory < 1) return false;
  return true;
}

export async function searchCruiseaSailings(filters: CruiseaFilters) {
  const { sailings, cabins } = await loadCatalogue();
  const summaries = sailings.map((s) => summarise(s, cabins));
  const filtered = summaries.filter((s) => matches(s, filters));

  const sort = filters.sort ?? "departure";
  filtered.sort((a, b) => {
    if (sort === "price-asc") return (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity);
    if (sort === "price-desc") return (b.fromPrice ?? 0) - (a.fromPrice ?? 0);
    if (sort === "duration") return a.durationNights - b.durationNights;
    return a.departureDate.localeCompare(b.departureDate);
  });

  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 48);
  const page = Math.max(filters.page ?? 1, 1);
  const start = (page - 1) * pageSize;

  return {
    results: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

export async function getCruiseaSailing(id: string): Promise<CruiseaSailingDetail | null> {
  const supabase = publicClient();
  const [sailingRes, cabinsRes] = await Promise.all([
    supabase.from("cruisea_sailings").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("cruisea_cabins")
      .select("*")
      .eq("sailing_id", id)
      .order("price_per_guest", { ascending: true }),
  ]);
  if (sailingRes.error) throw new Error(sailingRes.error.message);
  if (!sailingRes.data) return null;
  const cabins = (cabinsRes.data ?? []).map(mapCabin);
  const prices = cabins.map((c) => c.pricePerGuest);
  return {
    ...mapSailing(sailingRes.data),
    cabins,
    fromPrice: prices.length ? Math.min(...prices) : null,
  };
}

export async function getCruiseaFacets(): Promise<CruiseaFacets> {
  const { sailings, cabins } = await loadCatalogue();
  const summaries = sailings.map((s) => summarise(s, cabins));

  const tally = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  };

  const companyMap = new Map<string, { ships: Set<string>; sailings: number }>();
  for (const s of summaries) {
    const entry = companyMap.get(s.cruiseLine) ?? { ships: new Set<string>(), sailings: 0 };
    entry.ships.add(s.shipName);
    entry.sailings += 1;
    companyMap.set(s.cruiseLine, entry);
  }

  const monthMap = new Map<string, number>();
  const dateMap = new Map<string, number>();
  for (const s of summaries) {
    const month = s.departureDate.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
    dateMap.set(s.departureDate, (dateMap.get(s.departureDate) ?? 0) + 1);
  }

  const prices = summaries.map((s) => s.fromPrice ?? 0).filter((p) => p > 0);

  return {
    companies: [...companyMap.entries()]
      .map(([company, entry]) => ({
        company,
        ships: [...entry.ships].sort(),
        sailings: entry.sailings,
      }))
      .sort((a, b) => a.company.localeCompare(b.company)),
    cruiseTypes: tally(summaries.map((s) => s.cruiseType)),
    regions: tally(summaries.map((s) => s.region)),
    countries: tally(summaries.map((s) => s.country)),
    ports: tally(summaries.map((s) => s.embarkationPort)),
    areaTags: tally(summaries.flatMap((s) => s.areaTags)),
    packageOptions: tally(summaries.flatMap((s) => s.packageOptions)),
    cabinCategories: tally(summaries.flatMap((s) => s.cabinCategories)),
    departureMonths: [...monthMap.entries()]
      .map(([month, count]) => ({
        month,
        label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    departureDates: [...dateMap.entries()]
      .map(([date, sailingsCount]) => ({ date, sailings: sailingsCount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
  };
}

/** Live re-check of cabin price and inventory immediately before booking. */
export async function revalidateCruiseaCabin(input: {
  sailingId: string;
  cabinId: string;
  guests: number;
}): Promise<CruiseaAvailability> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("cruisea_cabins")
    .select("*")
    .eq("id", input.cabinId)
    .eq("sailing_id", input.sailingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That cabin grade is no longer offered on this sailing.");

  const cabin = mapCabin(data);
  const guests = Math.min(Math.max(Math.trunc(input.guests) || 1, 1), 8);
  const available = cabin.availableInventory > 0;

  return {
    sailingId: input.sailingId,
    cabinId: cabin.id,
    guests,
    available,
    ...(available ? {} : { reason: "This cabin grade is fully booked for this departure." }),
    category: cabin.category,
    label: cabin.label,
    pricePerGuest: cabin.pricePerGuest,
    totalPrice: Number((cabin.pricePerGuest * guests).toFixed(2)),
    currency: "USD",
    remainingInventory: cabin.availableInventory,
    revalidatedAt: new Date().toISOString(),
  };
}
