// HBX content ingestion + incremental synchronisation.
//
// Writes normalised supplier content into the shared catalogue tables with the
// original HBX identifiers preserved (`code` + `supplier_payload`), records
// every run in `hbx_sync_runs` for the admin console, and invalidates the
// in-process response cache for the affected suite when a run completes.
import { HBX_SUITE_CONFIG, HBX_SUPPLIER_ID, type HbxSuite } from "./config";
import { hbxCacheInvalidate, hbxCredentialStatus, hbxEnvironment, hbxSuiteEnabled } from "./client.server";
import { fetchHotelContentPage } from "./hotels.server";
import { fetchActivityContentPage } from "./activities.server";
import { fetchTransferPointsPage, fetchTransferRoutes } from "./transfers.server";
import type { HbxActivityProduct, HbxHotelProduct, HbxTransferProduct } from "./types";

export interface HbxSyncOutcome {
  suite: HbxSuite;
  environment: string;
  status: "completed" | "partial" | "failed" | "skipped";
  received: number;
  written: number;
  failed: number;
  pages: number;
  cursor: string | null;
  durationMs: number;
  message: string;
  runId: string | null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function openRun(suite: HbxSuite, resource: string) {
  const db = await admin();
  const { data } = await db
    .from("hbx_sync_runs")
    .insert({
      suite,
      resource,
      environment: hbxEnvironment(),
      status: "running",
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function closeRun(
  runId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!runId) return;
  const db = await admin();
  await db
    .from("hbx_sync_runs")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", runId);
}

function skipped(suite: HbxSuite, message: string): HbxSyncOutcome {
  return {
    suite,
    environment: hbxEnvironment(),
    status: "skipped",
    received: 0,
    written: 0,
    failed: 0,
    pages: 0,
    cursor: null,
    durationMs: 0,
    message,
    runId: null,
  };
}

function preflight(suite: HbxSuite): HbxSyncOutcome | null {
  if (!hbxSuiteEnabled(suite))
    return skipped(suite, `The ${HBX_SUITE_CONFIG[suite].label} suite is disabled by feature flag.`);
  const { configured, missing } = hbxCredentialStatus(suite);
  if (!configured)
    return skipped(suite, `Awaiting HBX credentials: ${missing.join(", ")}.`);
  return null;
}

// ------------------------------------------------------------------- rows

function hotelRow(p: HbxHotelProduct) {
  return {
    environment: p.environment,
    code: p.code,
    name: p.name,
    category_code: p.categoryCode,
    category_name: p.categoryName,
    star_rating: p.starRating,
    destination_code: p.destinationCode,
    destination_name: p.destinationName,
    zone_code: p.zoneCode,
    zone_name: p.zoneName,
    country_code: p.countryCode,
    state_code: p.stateCode,
    city: p.city,
    address: p.address,
    postal_code: p.postalCode,
    latitude: p.latitude,
    longitude: p.longitude,
    description: p.description,
    facilities: p.facilities,
    images: p.images,
    board_codes: p.boardCodes,
    segment_codes: p.segmentCodes,
    phones: p.phones,
    ranking: p.ranking,
    supplier_payload: { supplierId: HBX_SUPPLIER_ID, code: p.code, suite: p.suite },
    supplier_updated_at: p.supplierUpdatedAt,
    synced_at: new Date().toISOString(),
  };
}

function activityRow(p: HbxActivityProduct) {
  return {
    environment: p.environment,
    code: p.code,
    name: p.name,
    country_code: p.countryCode,
    destination_code: p.destinationCode,
    destination_name: p.destinationName,
    city: p.city,
    type: p.type,
    categories: p.categories,
    description: p.description,
    highlights: p.highlights,
    images: p.images,
    currency: p.currency,
    amount_from: p.amountFrom,
    duration: p.duration,
    latitude: p.latitude,
    longitude: p.longitude,
    languages: p.languages,
    supplier_payload: { supplierId: HBX_SUPPLIER_ID, code: p.code, suite: p.suite },
    synced_at: new Date().toISOString(),
  };
}

function transferRow(p: HbxTransferProduct) {
  return {
    environment: p.environment,
    code: p.code,
    from_type: p.fromType,
    from_code: p.fromCode,
    from_name: p.fromName,
    to_type: p.toType,
    to_code: p.toCode,
    to_name: p.toName,
    country_code: p.countryCode,
    destination_code: p.destinationCode,
    destination_name: p.destinationName,
    vehicle_categories: p.vehicleCategories,
    content: {},
    supplier_payload: { supplierId: HBX_SUPPLIER_ID, code: p.code, suite: p.suite },
    synced_at: new Date().toISOString(),
  };
}

async function upsert(table: string, rows: Record<string, unknown>[]): Promise<number> {
  if (!rows.length) return 0;
  const db = await admin();
  let written = 0;
  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    const { error } = await db
      .from(table as never)
      .upsert(chunk as never, { onConflict: "environment,code" });
    if (error) {
      console.error(JSON.stringify({ scope: "hbx", op: "upsert", table, message: error.message }));
      throw new Error(`Could not persist HBX ${table} content.`);
    }
    written += chunk.length;
  }
  return written;
}

// ------------------------------------------------------------------- sync

/** Hotel content sync. `since` (ISO date) enables HBX incremental mode. */
export async function syncHbxHotels(opts: {
  maxPages?: number;
  since?: string | undefined;
  countryCode?: string | undefined;
  destinationCode?: string | undefined;
} = {}): Promise<HbxSyncOutcome> {
  const blocked = preflight("hotels");
  if (blocked) return blocked;

  const started = Date.now();
  const pageSize = HBX_SUITE_CONFIG.hotels.pageSize;
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 3, 500));
  const runId = await openRun("hotels", "content");

  let received = 0;
  let written = 0;
  let failed = 0;
  let pages = 0;
  let cursor: string | null = null;
  let message = "Hotel content synchronised.";
  let status: HbxSyncOutcome["status"] = "completed";

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const from = page * pageSize + 1;
      const res = await fetchHotelContentPage({
        from,
        to: from + pageSize - 1,
        ...(opts.since ? { lastUpdateTime: opts.since.slice(0, 10) } : {}),
        ...(opts.countryCode ? { countryCode: opts.countryCode } : {}),
        ...(opts.destinationCode ? { destinationCode: opts.destinationCode } : {}),
      });
      pages += 1;
      if (!res.ok || !res.data) {
        failed += 1;
        status = received > 0 ? "partial" : "failed";
        message = res.error?.message ?? "HBX hotel content could not be retrieved.";
        break;
      }
      received += res.data.hotels.length;
      written += await upsert("hbx_hotels", res.data.hotels.map(hotelRow));
      cursor = String(res.data.to ?? from);
      if (res.data.hotels.length < pageSize || received >= res.data.total) break;
    }
  } catch (e) {
    status = "failed";
    failed += 1;
    message = e instanceof Error ? e.message : "Hotel content sync failed.";
  }

  hbxCacheInvalidate("hotels:");
  await closeRun(runId, {
    status,
    received,
    created: written,
    updated: 0,
    unchanged: 0,
    failed,
    cursor,
    error: status === "completed" ? null : message,
    detail: { pages, since: opts.since ?? null },
  });

  return {
    suite: "hotels",
    environment: hbxEnvironment(),
    status,
    received,
    written,
    failed,
    pages,
    cursor,
    durationMs: Date.now() - started,
    message,
    runId,
  };
}

export async function syncHbxActivities(opts: {
  maxPages?: number;
  country?: string | undefined;
  destination?: string | undefined;
} = {}): Promise<HbxSyncOutcome> {
  const blocked = preflight("activities");
  if (blocked) return blocked;

  const started = Date.now();
  const pageSize = HBX_SUITE_CONFIG.activities.pageSize;
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 3, 500));
  const runId = await openRun("activities", "content");

  let received = 0;
  let written = 0;
  let failed = 0;
  let pages = 0;
  let message = "Experience content synchronised.";
  let status: HbxSyncOutcome["status"] = "completed";
  let cursor: string | null = null;

  // The HBX experiences feed requires at least one filter, so with no explicit
  // scope we walk a seed destination list.
  const scopes: { country?: string; destination?: string }[] =
    opts.country || opts.destination
      ? [{ ...(opts.country ? { country: opts.country } : {}), ...(opts.destination ? { destination: opts.destination } : {}) }]
      : ["PMI", "BCN", "MAD", "AGP", "TFS", "LPA"].map((destination) => ({ destination }));

  try {
    outer: for (const scope of scopes) {
      for (let page = 0; page < maxPages; page += 1) {
        const res = await fetchActivityContentPage({
          offset: page * pageSize,
          limit: pageSize,
          ...(scope.country ? { country: scope.country } : {}),
          ...(scope.destination ? { destination: scope.destination } : {}),
        });
        pages += 1;
        if (!res.ok || !res.data) {
          failed += 1;
          status = received > 0 ? "partial" : "failed";
          message = res.error?.message ?? "HBX experience content could not be retrieved.";
          break outer;
        }
        received += res.data.activities.length;
        written += await upsert("hbx_activities", res.data.activities.map(activityRow));
        cursor = String(res.data.offset + res.data.activities.length);
        if (res.data.activities.length < pageSize || received >= res.data.total) break;
      }
    }

  } catch (e) {
    status = "failed";
    failed += 1;
    message = e instanceof Error ? e.message : "Experience content sync failed.";
  }

  hbxCacheInvalidate("activities:");
  await closeRun(runId, {
    status,
    received,
    created: written,
    failed,
    cursor,
    error: status === "completed" ? null : message,
    detail: { pages },
  });

  return {
    suite: "activities",
    environment: hbxEnvironment(),
    status,
    received,
    written,
    failed,
    pages,
    cursor,
    durationMs: Date.now() - started,
    message,
    runId,
  };
}

const POINT_PAGE = 1000;
const MAX_HOTEL_PAGES = 60;

async function syncTransferPointsForCountry(countryCode: string): Promise<{ received: number; written: number; failed: boolean; message: string }> {
  const environment = hbxEnvironment();
  const db = await admin();
  let received = 0;
  let written = 0;
  for (const kind of ["terminals", "hotels"] as const) {
    for (let page = 0; page < (kind === "hotels" ? MAX_HOTEL_PAGES : 10); page++) {
      const res = await fetchTransferPointsPage(kind, { countryCode, offset: page * POINT_PAGE, limit: POINT_PAGE });
      if (!res.ok || !res.data) {
        return { received, written, failed: true, message: res.error?.message ?? `Transfer ${kind} could not be retrieved.` };
      }
      received += res.data.length;
      const now = new Date().toISOString();
      const rows = res.data.map((r) => ({ ...r, environment, synced_at: now }));
      for (let i = 0; i < rows.length; i += 250) {
        const { error } = await db
          .from("hbx_transfer_points" as never)
          .upsert(rows.slice(i, i + 250) as never, { onConflict: "environment,point_type,code" });
        if (error) return { received, written, failed: true, message: "Could not persist transfer points." };
        written += Math.min(250, rows.length - i);
      }
      if (res.data.length < POINT_PAGE) break;
    }
  }
  return { received, written, failed: false, message: "" };
}

export async function syncHbxTransfers(opts: {
  countryCodes?: string[] | undefined;
} = {}): Promise<HbxSyncOutcome> {
  const blocked = preflight("transfers");
  if (blocked) return blocked;

  const started = Date.now();
  const countries = (opts.countryCodes?.length ? opts.countryCodes : ["ES", "IT", "AE", "GB", "IN", "US"])
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 25);
  const runId = await openRun("transfers", "routes");

  let received = 0;
  let written = 0;
  let failed = 0;
  let message = "Transfer routes synchronised.";
  let status: HbxSyncOutcome["status"] = "completed";

  try {
    for (const countryCode of countries) {
      // Transfer points (airports, ports, stations, hotels) power search and
      // product mapping. The legacy /routes content endpoint is not published
      // on the Transfers Cache API (404), so routes are best-effort only.
      const pts = await syncTransferPointsForCountry(countryCode);
      received += pts.received;
      written += pts.written;
      if (pts.failed) {
        failed += 1;
        status = received > 0 ? "partial" : "failed";
        message = pts.message;
      }
      const res = await fetchTransferRoutes({ countryCode });
      if (!res.ok && res.status === 404) continue;
      if (!res.ok || !res.data) {
        failed += 1;
        status = received > 0 ? "partial" : "failed";
        message = res.error?.message ?? "HBX transfer routes could not be retrieved.";
        continue;
      }
      received += res.data.routes.length;
      written += await upsert("hbx_transfer_routes", res.data.routes.map(transferRow));
    }
  } catch (e) {
    status = "failed";
    failed += 1;
    message = e instanceof Error ? e.message : "Transfer route sync failed.";
  }

  hbxCacheInvalidate("transfers:");
  await closeRun(runId, {
    status,
    received,
    created: written,
    failed,
    error: status === "completed" ? null : message,
    detail: { countries },
  });

  return {
    suite: "transfers",
    environment: hbxEnvironment(),
    status,
    received,
    written,
    failed,
    pages: countries.length,
    cursor: null,
    durationMs: Date.now() - started,
    message,
    runId,
  };
}

// --------------------------------------------------------------- admin view

export interface HbxSyncSummary {
  suite: HbxSuite;
  label: string;
  rows: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastReceived: number | null;
  lastWritten: number | null;
  lastError: string | null;
  recentFailures: number;
}

const TABLE_FOR_SUITE: Record<HbxSuite, string> = {
  hotels: "hbx_hotels",
  activities: "hbx_activities",
  transfers: "hbx_transfer_routes",
};

export async function hbxSyncSummary(): Promise<HbxSyncSummary[]> {
  const db = await admin();
  const environment = hbxEnvironment();
  const suites: HbxSuite[] = ["hotels", "activities", "transfers"];

  return Promise.all(
    suites.map(async (suite) => {
      const [{ count }, { data: runs }] = await Promise.all([
        db
          .from(TABLE_FOR_SUITE[suite] as never)
          .select("id", { count: "exact", head: true })
          .eq("environment", environment),
        db
          .from("hbx_sync_runs")
          .select("started_at,status,received,created,error")
          .eq("suite", suite)
          .order("started_at", { ascending: false })
          .limit(10),
      ]);
      const last = runs?.[0] ?? null;
      return {
        suite,
        label: HBX_SUITE_CONFIG[suite].label,
        rows: count ?? 0,
        lastRunAt: last?.started_at ?? null,
        lastStatus: last?.status ?? null,
        lastReceived: last?.received ?? null,
        lastWritten: last?.created ?? null,
        lastError: last?.error ?? null,
        recentFailures: (runs ?? []).filter((r) => r.status === "failed" || r.status === "partial")
          .length,
      };
    }),
  );
}
