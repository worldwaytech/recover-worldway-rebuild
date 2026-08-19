// HBX catalogue read path — searchable/filterable projections over the
// synchronised content tables. Reads use the publishable-key client behind the
// public SELECT policies, project only safe columns and never touch supplier
// credentials.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hbxEnvironment } from "./client.server";
import type { HbxSuite } from "./config";

function publicDb() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export interface HbxCatalogueQuery {
  suite: HbxSuite;
  q?: string | undefined;
  countryCode?: string | undefined;
  destinationCode?: string | undefined;
  minStars?: number | undefined;
  category?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface HbxCatalogueCard {
  code: string;
  title: string;
  subtitle: string | null;
  location: string | null;
  countryCode: string | null;
  destinationCode: string | null;
  image: string | null;
  stars: number | null;
  priceFrom: number | null;
  currency: string | null;
  tags: string[];
  supplierId: string;
  supplierCode: string;
}

export interface HbxCatalogueResult {
  suite: HbxSuite;
  items: HbxCatalogueCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  environment: string;
  /** True when nothing has been synchronised yet for this environment. */
  empty: boolean;
  message: string | null;
}

const HOTEL_IMAGE_FALLBACK: string | null = null;

export async function queryHbxCatalogue(query: HbxCatalogueQuery): Promise<HbxCatalogueResult> {
  const environment = hbxEnvironment();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, query.pageSize ?? 24));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const db = publicDb();
  const term = query.q?.trim();

  if (query.suite === "hotels") {
    let sel = db
      .from("hbx_hotels")
      .select(
        "code,name,category_name,star_rating,city,destination_name,destination_code,country_code,images,description",
        { count: "exact" },
      )
      .eq("environment", environment);
    if (term) sel = sel.ilike("name", `%${term}%`);
    if (query.countryCode) sel = sel.eq("country_code", query.countryCode.toUpperCase());
    if (query.destinationCode) sel = sel.eq("destination_code", query.destinationCode.toUpperCase());
    if (query.minStars) sel = sel.gte("star_rating", query.minStars);
    const { data, count, error } = await sel.order("ranking", { ascending: true }).range(from, to);
    if (error) throw new Error("The HBX hotel catalogue could not be read.");
    const items = (data ?? []).map((row): HbxCatalogueCard => {
      const images = Array.isArray(row.images) ? (row.images as { url?: string }[]) : [];
      return {
        code: row.code,
        title: row.name,
        subtitle: row.category_name ?? null,
        location: [row.city, row.destination_name].filter(Boolean).join(", ") || null,
        countryCode: row.country_code ?? null,
        destinationCode: row.destination_code ?? null,
        image: images[0]?.url ?? HOTEL_IMAGE_FALLBACK,
        stars: row.star_rating != null ? Number(row.star_rating) : null,
        priceFrom: null,
        currency: null,
        tags: row.category_name ? [row.category_name] : [],
        supplierId: "hbx-group",
        supplierCode: row.code,
      };
    });
    return finish("hotels", items, count ?? 0, page, pageSize, environment);
  }

  if (query.suite === "activities") {
    let sel = db
      .from("hbx_activities")
      .select(
        "code,name,type,city,destination_name,destination_code,country_code,images,currency,amount_from,duration,categories",
        { count: "exact" },
      )
      .eq("environment", environment);
    if (term) sel = sel.ilike("name", `%${term}%`);
    if (query.countryCode) sel = sel.eq("country_code", query.countryCode.toUpperCase());
    if (query.destinationCode) sel = sel.eq("destination_code", query.destinationCode.toUpperCase());
    const { data, count, error } = await sel.order("name", { ascending: true }).range(from, to);
    if (error) throw new Error("The HBX experiences catalogue could not be read.");
    const items = (data ?? []).map((row): HbxCatalogueCard => {
      const images = Array.isArray(row.images) ? (row.images as string[]) : [];
      const categories = Array.isArray(row.categories) ? (row.categories as string[]) : [];
      return {
        code: row.code,
        title: row.name,
        subtitle: row.duration ?? row.type ?? null,
        location: [row.city, row.destination_name].filter(Boolean).join(", ") || null,
        countryCode: row.country_code ?? null,
        destinationCode: row.destination_code ?? null,
        image: images[0] ?? null,
        stars: null,
        priceFrom: row.amount_from != null ? Number(row.amount_from) : null,
        currency: row.currency ?? null,
        tags: categories.slice(0, 3),
        supplierId: "hbx-group",
        supplierCode: row.code,
      };
    });
    return finish("activities", items, count ?? 0, page, pageSize, environment);
  }

  let sel = db
    .from("hbx_transfer_routes")
    .select(
      "code,from_name,from_type,to_name,to_type,country_code,destination_code,destination_name,vehicle_categories",
      { count: "exact" },
    )
    .eq("environment", environment);
  if (term) sel = sel.ilike("from_name", `%${term}%`);
  if (query.countryCode) sel = sel.eq("country_code", query.countryCode.toUpperCase());
  if (query.destinationCode) sel = sel.eq("destination_code", query.destinationCode.toUpperCase());
  const { data, count, error } = await sel.order("from_name", { ascending: true }).range(from, to);
  if (error) throw new Error("The HBX transfers catalogue could not be read.");
  const items = (data ?? []).map((row): HbxCatalogueCard => {
    const vehicles = Array.isArray(row.vehicle_categories)
      ? (row.vehicle_categories as { label?: string; code?: string }[])
      : [];
    return {
      code: row.code,
      title: `${row.from_name ?? row.from_type ?? "Pick-up"} → ${row.to_name ?? row.to_type ?? "Drop-off"}`,
      subtitle: row.destination_name ?? null,
      location: row.destination_name ?? null,
      countryCode: row.country_code ?? null,
      destinationCode: row.destination_code ?? null,
      image: null,
      stars: null,
      priceFrom: null,
      currency: null,
      tags: vehicles
        .map((v) => v.label ?? v.code)
        .filter((v): v is string => Boolean(v))
        .slice(0, 3),
      supplierId: "hbx-group",
      supplierCode: row.code,
    };
  });
  return finish("transfers", items, count ?? 0, page, pageSize, environment);
}

function finish(
  suite: HbxSuite,
  items: HbxCatalogueCard[],
  total: number,
  page: number,
  pageSize: number,
  environment: string,
): HbxCatalogueResult {
  return {
    suite,
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    environment,
    empty: total === 0,
    message:
      total === 0
        ? "No HBX content has been synchronised for this environment yet. Run a content sync from the HBX admin console once credentials are active."
        : null,
  };
}

export async function getHbxHotel(code: string) {
  const db = publicDb();
  const { data } = await db
    .from("hbx_hotels")
    .select("*")
    .eq("environment", hbxEnvironment())
    .eq("code", code)
    .maybeSingle();
  return data ?? null;
}
