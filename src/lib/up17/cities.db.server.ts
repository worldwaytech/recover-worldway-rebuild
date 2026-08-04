// UP17 city master lookups (server-only).
//
// The official UP17 Hotel City Master (51,462 rows) and Bus City Master
// (17,020 rows) are imported into the `up17_hotel_cities` / `up17_bus_cities`
// reference tables, so lookups are indexed in Postgres instead of bundled
// into the worker.

export type Up17City = {
  cityId: string;
  city: string;
  country: string;
  countryCode: string;
  type: "hotel" | "bus";
  state?: string;
};

type Rest = { url: string; key: string };

function rest(): Rest | null {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function query<T>(table: string, params: string): Promise<T[]> {
  const cfg = rest();
  if (!cfg) return [];
  try {
    const res = await fetch(`${cfg.url}/rest/v1/${table}?${params}`, {
      headers: { apikey: cfg.key, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error("UP17 city lookup failed", { table, status: res.status });
      return [];
    }
    return (await res.json()) as T[];
  } catch (e) {
    console.error("UP17 city lookup error", e instanceof Error ? e.message : e);
    return [];
  }
}

type HotelRow = {
  city_id: string;
  destination: string;
  state_province: string | null;
  country: string | null;
  country_code: string | null;
  priority: number | null;
};

type BusRow = { city_id: string; city_name: string; priority: number | null };

const toHotelCity = (r: HotelRow): Up17City => ({
  cityId: String(r.city_id),
  city: r.destination.trim(),
  country: (r.country ?? "").trim(),
  countryCode: (r.country_code ?? "").trim().toUpperCase(),
  type: "hotel",
  state: (r.state_province ?? "").trim() || undefined,
});

const toBusCity = (r: BusRow): Up17City => ({
  cityId: String(r.city_id),
  city: r.city_name.trim(),
  country: "India",
  countryCode: "IN",
  type: "bus",
});

const esc = (value: string) => encodeURIComponent(value.replace(/[,()*]/g, " ").trim());

const baseName = (value: string) => value.split(",")[0]?.trim() ?? value.trim();

function dedupe(rows: Up17City[], limit: number): Up17City[] {
  const seen = new Set<string>();
  const out: Up17City[] = [];
  for (const row of rows) {
    const key = `${row.cityId}:${row.city.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchHotelCities(queryText: string, limit = 12): Promise<Up17City[]> {
  const q = baseName(queryText);
  if (q.length < 2) return [];
  const select = "select=city_id,destination,state_province,country,country_code,priority";
  const order = "order=priority.desc.nullslast,destination.asc";
  const [exact, prefix, contains] = await Promise.all([
    query<HotelRow>("up17_hotel_cities", `${select}&destination=ilike.${esc(q)}&${order}&limit=${limit}`),
    query<HotelRow>("up17_hotel_cities", `${select}&destination=ilike.${esc(q)}*&${order}&limit=${limit}`),
    query<HotelRow>("up17_hotel_cities", `${select}&destination=ilike.*${esc(q)}*&${order}&limit=${limit}`),
  ]);
  return dedupe([...exact, ...prefix, ...contains].map(toHotelCity), limit);
}

export async function searchBusCities(queryText: string, limit = 12): Promise<Up17City[]> {
  const q = baseName(queryText);
  if (q.length < 2) return [];
  const select = "select=city_id,city_name,priority";
  const order = "order=priority.desc.nullslast,city_name.asc";
  const [exact, prefix, contains] = await Promise.all([
    query<BusRow>("up17_bus_cities", `${select}&city_name=ilike.${esc(q)}&${order}&limit=${limit}`),
    query<BusRow>("up17_bus_cities", `${select}&city_name=ilike.${esc(q)}*&${order}&limit=${limit}`),
    query<BusRow>("up17_bus_cities", `${select}&city_name=ilike.*${esc(q)}*&${order}&limit=${limit}`),
  ]);
  return dedupe([...exact, ...prefix, ...contains].map(toBusCity), limit);
}

export async function searchUp17Cities(
  queryText: string,
  limit = 12,
  kind: "hotel" | "bus" = "hotel",
): Promise<Up17City[]> {
  return kind === "bus" ? searchBusCities(queryText, limit) : searchHotelCities(queryText, limit);
}

export async function findUp17CityByName(
  name: string,
  kind: "hotel" | "bus" = "hotel",
): Promise<Up17City | null> {
  const rows = await searchUp17Cities(name, 5, kind);
  if (!rows.length) return null;
  const q = baseName(name).toLowerCase();
  return rows.find((r) => r.city.toLowerCase() === q) ?? rows[0];
}
