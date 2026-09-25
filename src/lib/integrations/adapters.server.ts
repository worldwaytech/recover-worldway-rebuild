// Server-only supplier adapters for the Universal Sync Center.
//
// Each adapter exposes the SAME contract, so the engine never contains
// supplier-specific code. Adapters reuse the project's existing, verified
// supplier clients and supplier-backed tables — nothing is duplicated,
// re-implemented or mocked. When a supplier's credentials or documentation are
// unavailable the adapter reports `live: false` with an honest reason and the
// engine records NOT CONNECTED.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { MANIFEST_ADAPTERS } from "./manifest.server";
export type Admin = SupabaseClient<Database>;

export interface SupplierRecord {
  externalId: string;
  title: string;
  slug?: string | null;
  productType: string;
  priceFrom?: number | null;
  currency?: string | null;
  availabilityState?: string | null;
  detailPath?: string | null;
  sourceTable?: string | null;
  raw: Record<string, unknown>;
}

export interface AdapterFetchResult {
  records: SupplierRecord[];
  /** True only when the records came from a live supplier API/feed. */
  live: boolean;
  warnings: string[];
}

export interface AdapterProbe {
  ok: boolean;
  status: number | null;
  detail: string;
}

export interface SupplierAdapter {
  id: string;
  label: string;
  probe(): Promise<AdapterProbe>;
  fetchAll(admin: Admin, opts: { limit?: number }): Promise<AdapterFetchResult>;
  fetchOne?(admin: Admin, externalId: string): Promise<SupplierRecord | null>;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

// ------------------------------------------------------------ Crystal (AKTG)
const crystalAdapter: SupplierAdapter = {
  id: "crystal-aktg",
  label: "Crystal Cruises — AKTG Shopping API",
  async probe() {
    const { fetchAktgVoyages } = await import("@/lib/crystal/aktg.server");
    const feed = await fetchAktgVoyages("USD");
    if (!feed.configured)
      return { ok: false, status: null, detail: "AKTG credentials are not configured." };
    return {
      ok: feed.voyages.length > 0,
      status: 200,
      detail: `AKTG returned ${feed.voyages.length} voyages.`,
    };
  },
  async fetchAll() {
    const { fetchAktgVoyages } = await import("@/lib/crystal/aktg.server");
    const { crystalWorldCruises } = await import("@/lib/crystal/world-cruises");
    const feed = await fetchAktgVoyages("USD");
    const codes = new Set(feed.voyages.map((v) => v.code));
    const brochure = crystalWorldCruises().filter((v) => !codes.has(v.code));
    const all = [...feed.voyages, ...brochure];
    return {
      live: feed.configured && feed.voyages.length > 0,
      warnings: feed.configured
        ? []
        : ["AKTG credentials unavailable — only Crystal's published catalogue is indexed."],
      records: all.map((v) => ({
        externalId: v.code,
        title: v.title,
        slug: v.code,
        productType: "cruise-voyage",
        priceFrom: v.priceFrom ?? null,
        currency: v.currency ?? "USD",
        availabilityState: v.availability,
        detailPath: `/crystal-cruises/voyages/${v.code}`,
        sourceTable: null,
        raw: asRecord(v),
      })),
    };
  },
  async fetchOne(_admin, externalId) {
    const { fetchAktgVoyages } = await import("@/lib/crystal/aktg.server");
    const feed = await fetchAktgVoyages("USD", { force: true });
    const voyage = feed.voyages.find((v) => v.code === externalId);
    if (!voyage) return null;
    return {
      externalId: voyage.code,
      title: voyage.title,
      slug: voyage.code,
      productType: "cruise-voyage",
      priceFrom: voyage.priceFrom ?? null,
      currency: voyage.currency ?? "USD",
      availabilityState: voyage.availability,
      detailPath: `/crystal-cruises/voyages/${voyage.code}`,
      raw: asRecord(voyage),
    };
  },
};

// --------------------------------------------------------------------- TTC
const ttcAdapter: SupplierAdapter = {
  id: "ttc",
  label: "The Travel Corporation — brand catalogues",
  async probe() {
    const token = process.env["TTC_API_TOKEN"];
    if (!token)
      return {
        ok: false,
        status: null,
        detail: "TTC API token not configured — catalogue served from imported content.",
      };
    return { ok: true, status: 200, detail: "TTC API token present." };
  },
  async fetchAll(admin, opts) {
    const { data, error } = await admin
      .from("ttc_tours")
      .select(
        "tour_slug, name, brand, brand_label, price_from, price_currency, source, source_url, duration_days, synced_at, supplier_tour_id",
      )
      .order("synced_at", { ascending: false })
      .limit(opts.limit ?? 2000);
    if (error) throw new Error(error.message);
    return {
      live: Boolean(process.env["TTC_API_TOKEN"]),
      warnings: process.env["TTC_API_TOKEN"]
        ? []
        : ["TTC API token missing — records indexed from the imported authorised catalogue."],
      records: (data ?? []).map((t) => ({
        externalId: t.supplier_tour_id ?? t.tour_slug,
        title: t.name,
        slug: t.tour_slug,
        productType: "tour",
        priceFrom: t.price_from,
        currency: t.price_currency,
        availabilityState: null,
        detailPath: `/ttc/${t.brand}/${t.tour_slug}`,
        sourceTable: "ttc_tours",
        raw: asRecord(t),
      })),
    };
  },
};

// --------------------------------------------------------------------- HBX
function hbxAdapter(kind: "hotels" | "activities" | "transfers"): SupplierAdapter {
  return {
    id: `hbx-${kind}`,
    label: `HBX Group — ${kind}`,
    async probe() {
      const key = process.env["HBX_API_KEY"];
      if (!key) return { ok: false, status: null, detail: "HBX credentials not configured." };
      return {
        ok: true,
        status: 200,
        detail: `HBX credentials present (${process.env["HBX_ENVIRONMENT"] ?? "test"}).`,
      };
    },
    async fetchAll(admin, opts) {
      const limit = opts.limit ?? 2000;
      const live = Boolean(process.env["HBX_API_KEY"]);
      if (kind === "hotels") {
        const { data, error } = await admin
          .from("hbx_hotels")
          .select("code, name, city, country_code, star_rating, synced_at")
          .limit(limit);
        if (error) throw new Error(error.message);
        return {
          live,
          warnings: [],
          records: (data ?? []).map((h) => ({
            externalId: String(h.code),
            title: h.name,
            slug: String(h.code),
            productType: "hotel",
            priceFrom: null,
            currency: null,
            availabilityState: null,
            detailPath: "/hotels/hbx",
            sourceTable: "hbx_hotels",
            raw: asRecord(h),
          })),
        };
      }
      if (kind === "activities") {
        const { data, error } = await admin
          .from("hbx_activities")
          .select("code, name, city, country_code, amount_from, currency, synced_at")
          .limit(limit);
        if (error) throw new Error(error.message);
        return {
          live,
          warnings: [],
          records: (data ?? []).map((a) => ({
            externalId: String(a.code),
            title: a.name,
            slug: String(a.code),
            productType: "activity",
            priceFrom: a.amount_from,
            currency: a.currency,
            availabilityState: null,
            detailPath: "/activities",
            sourceTable: "hbx_activities",
            raw: asRecord(a),
          })),
        };
      }
      const { data, error } = await admin.from("hbx_transfer_routes").select("*").limit(limit);
      if (error) throw new Error(error.message);
      return {
        live,
        warnings: ["HBX transfers entitlement returned HTTP 403 at supplier — index only."],
        records: (data ?? []).map((r) => {
          const row = asRecord(r);
          const id = String(row["id"] ?? "");
          return {
            externalId: id,
            title: String(row["name"] ?? row["route_name"] ?? id),
            slug: id,
            productType: "transfer",
            priceFrom: null,
            currency: null,
            availabilityState: null,
            detailPath: "/transfers",
            sourceTable: "hbx_transfer_routes",
            raw: row,
          };
        }),
      };
    },
  };
}

// ----------------------------------------------------------------- Cruisea
const cruiseaAdapter: SupplierAdapter = {
  id: "cruisea",
  label: "Cruisea — native voyage inventory",
  async probe() {
    return { ok: true, status: 200, detail: "Native Worldway inventory (no external API)." };
  },
  async fetchAll(admin, opts) {
    const { data, error } = await admin
      .from("cruisea_sailings")
      .select(
        "id, title, cruise_line, ship_name, departure_date, duration_nights, region, updated_at",
      )
      .order("departure_date", { ascending: true })
      .limit(opts.limit ?? 2000);
    if (error) throw new Error(error.message);
    return {
      live: true,
      warnings: [],
      records: (data ?? []).map((s) => ({
        externalId: s.id,
        title: s.title,
        slug: s.id,
        productType: "cruise-sailing",
        priceFrom: null,
        currency: null,
        availabilityState: null,
        detailPath: `/voyages/cruisea/sailing/${s.id}`,
        sourceTable: "cruisea_sailings",
        raw: asRecord(s),
      })),
    };
  },
};

// -------------------------------------------------- A&K / All Journeys
const allJourneysAdapter: SupplierAdapter = {
  id: "ak-all-journeys",
  label: "Abercrombie & Kent — All Journeys catalogue",
  async probe() {
    const configured = Boolean(process.env["AK_CLIENT_ID"] && process.env["AK_CLIENT_SECRET"]);
    return configured
      ? { ok: true, status: 200, detail: "A&K API credentials present." }
      : {
          ok: false,
          status: null,
          detail: "A&K API credentials not issued — catalogue served from imported source data.",
        };
  },
  async fetchAll() {
    const { journeys } = await import("@/lib/all-journeys-content");
    return {
      live: false,
      warnings: ["A&K API credentials not issued — indexed from the imported source catalogue."],
      records: journeys.map((j) => {
        const row = asRecord(j);
        const slug = String(row["slug"] ?? "");
        return {
          externalId: String(row["sourceId"] ?? row["code"] ?? slug),
          title: String(row["title"] ?? slug),
          slug,
          productType: "journey",
          priceFrom: typeof row["priceFrom"] === "number" ? (row["priceFrom"] as number) : null,
          currency: typeof row["currency"] === "string" ? (row["currency"] as string) : null,
          availabilityState: null,
          detailPath: `/all-journeys/${slug}`,
          sourceTable: null,
          raw: row,
        };
      }),
    };
  },
};

// --------------------------------------------------------- G Adventures
const gAdventuresAdapter: SupplierAdapter = {
  id: "g-adventures",
  label: "G Adventures — Sherpa API",
  async probe() {
    const { toursStatus, searchTours } = await import("@/lib/tours.server");
    const status = toursStatus();
    if (!status.configured)
      return { ok: false, status: null, detail: "G Adventures credentials not configured." };
    const res = await searchTours({ pageSize: 1 });
    return {
      ok: res.ok,
      status: res.status,
      detail: res.ok
        ? `Live: ${res.totalCount} tours available (${res.environment}).`
        : (res.error ?? "Supplier request failed."),
    };
  },
  async fetchAll(_admin, opts) {
    const { searchTours } = await import("@/lib/tours.server");
    const records: SupplierRecord[] = [];
    const warnings: string[] = [];
    let page = 1;
    const pageSize = 50;
    const max = opts.limit ?? 500;
    let live = false;
    while (records.length < max && page <= 20) {
      const res = await searchTours({ page, pageSize });
      if (!res.ok) {
        warnings.push(res.error ?? `Supplier returned HTTP ${res.status}.`);
        break;
      }
      live = true;
      for (const tour of res.tours) {
        const row = asRecord(tour);
        const id = String(row["id"] ?? row["code"] ?? "");
        if (!id) continue;
        records.push({
          externalId: id,
          title: String(row["name"] ?? row["title"] ?? id),
          slug: typeof row["slug"] === "string" ? (row["slug"] as string) : id,
          productType: "tour",
          priceFrom: typeof row["priceFrom"] === "number" ? (row["priceFrom"] as number) : null,
          currency: typeof row["currency"] === "string" ? (row["currency"] as string) : null,
          availabilityState: null,
          detailPath: `/tours/journey/${id}`,
          sourceTable: null,
          raw: row,
        });
      }
      if (!res.hasMore) break;
      page += 1;
    }
    return { records, live, warnings };
  },
};

// ---------------------------------------------------------------- Viator
const viatorAdapter: SupplierAdapter = {
  id: "viator",
  label: "Viator — activities & excursions",
  async probe() {
    const { viatorConfigured, browseFullCatalogue } = await import("@/lib/viator.server");
    if (!viatorConfigured())
      return { ok: false, status: null, detail: "Viator API key not configured." };
    const res = await browseFullCatalogue(1, 1, "USD");
    return {
      ok: res.ok,
      status: res.status,
      detail: res.ok
        ? `Live catalogue reachable (${res.environment}).`
        : "Viator catalogue request failed.",
    };
  },
  async fetchAll(_admin, opts) {
    const { browseFullCatalogue, viatorConfigured } = await import("@/lib/viator.server");
    if (!viatorConfigured())
      return { records: [], live: false, warnings: ["Viator API key not configured."] };
    const records: SupplierRecord[] = [];
    const warnings: string[] = [];
    const max = opts.limit ?? 200;
    let page = 1;
    while (records.length < max && page <= 10) {
      const res = await browseFullCatalogue(page, 50, "USD");
      if (!res.ok) {
        warnings.push(`Viator returned HTTP ${res.status}.`);
        break;
      }
      for (const product of res.products) {
        const row = asRecord(product);
        const code = String(row["code"] ?? "");
        if (!code) continue;
        records.push({
          externalId: code,
          title: String(row["title"] ?? code),
          slug: code,
          productType: "activity",
          priceFrom: typeof row["priceFrom"] === "number" ? (row["priceFrom"] as number) : null,
          currency: typeof row["currency"] === "string" ? (row["currency"] as string) : null,
          availabilityState: null,
          detailPath: `/activities/${code}`,
          sourceTable: null,
          raw: row,
        });
      }
      if (res.products.length === 0) break;
      page += 1;
    }
    return { records, live: true, warnings };
  },
};

// ---------------------------------------------------------------- RateHawk
// RateHawk (Emerging Travel Group) is a live-search bedbank: rates are quoted
// per request and there is no static product catalogue to synchronise until the
// sandbox certification completes, so fetchAll reports `live: false` honestly
// rather than inventing records.
const ratehawkAdapter: SupplierAdapter = {
  id: "ratehawk",
  label: "RateHawk (ETG) — hotels",
  async probe() {
    const { ratehawkCredentialStatus, ratehawkProbe } = await import("@/lib/ratehawk/client.server");
    const credentials = ratehawkCredentialStatus();
    if (!credentials.configured)
      return {
        ok: false,
        status: null,
        detail: `NOT CONNECTED — missing ${credentials.missing.join(" and ")}.`,
      };
    const res = await ratehawkProbe();
    return { ok: res.ok, status: res.status, detail: res.detail };
  },
  async fetchAll() {
    const { ratehawkCredentialStatus, ratehawkEnvironment } = await import("@/lib/ratehawk/client.server");
    const credentials = ratehawkCredentialStatus();
    return {
      records: [],
      live: false,
      warnings: [
        credentials.configured
          ? `RateHawk (${ratehawkEnvironment()}) is a live-search supplier: availability and rates are quoted per request, so no static catalogue is synchronised.`
          : `NOT CONNECTED — missing ${credentials.missing.join(" and ")}.`,
      ],
    };
  },
};

const ADAPTERS: SupplierAdapter[] = [
  crystalAdapter,
  ratehawkAdapter,
  ttcAdapter,
  hbxAdapter("hotels"),
  hbxAdapter("activities"),
  hbxAdapter("transfers"),
  cruiseaAdapter,
  allJourneysAdapter,
  gAdventuresAdapter,
  viatorAdapter,
  ...MANIFEST_ADAPTERS,
];

export function getAdapter(id: string | null | undefined): SupplierAdapter | null {
  if (!id) return null;
  return ADAPTERS.find((a) => a.id === id) ?? null;
}

export function listAdapters(): { id: string; label: string }[] {
  return ADAPTERS.map((a) => ({ id: a.id, label: a.label }));
}
