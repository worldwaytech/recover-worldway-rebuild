// HBX Activities Content API adapter (+ Activities cache/booking readiness).
import { HBX_SUITE_CONFIG } from "./config";
import { hbxCall, hbxEnvironment } from "./client.server";
import { normaliseActivity } from "./normalize";
import { hbxActivitiesResponseSchema, type HbxActivityProduct, type HbxResult } from "./types";

const CFG = HBX_SUITE_CONFIG.activities;

export interface HbxActivityPage {
  activities: HbxActivityProduct[];
  total: number;
  offset: number;
}

/**
 * Paginated experiences content crawl. HBX Activities content is retrieved with
 * a POST search body (pagination + optional country/destination filters).
 */
export async function fetchActivityContentPage(params: {
  offset: number;
  limit: number;
  language?: string;
  country?: string;
  destination?: string;
  from?: string;
  to?: string;
}): Promise<HbxResult<HbxActivityPage>> {
  const filters: Record<string, unknown>[] = [];
  if (params.country) filters.push({ searchFilterItems: [{ type: "country", value: params.country }] });
  if (params.destination)
    filters.push({ searchFilterItems: [{ type: "destination", value: params.destination }] });

  // The HBX Activities *content* operation is code-driven (`codes` required),
  // so the enumerable catalogue feed is the cache/availability operation. A
  // date window and at least one filter are mandatory.
  const day = 24 * 60 * 60 * 1000;
  const from = params.from ?? new Date(Date.now() + 30 * day).toISOString().slice(0, 10);
  const to = params.to ?? new Date(Date.now() + 37 * day).toISOString().slice(0, 10);

  const res = await hbxCall<unknown>({
    suite: "activities",
    api: "booking",
    path: CFG.bookingEndpoints["availability"]!,
    method: "POST",
    body: {
      language: params.language ?? "en",
      pagination: { itemsPerPage: params.limit, page: Math.floor(params.offset / params.limit) + 1 },
      filters,
      from,
      to,
    },
    operation: "activities.content.page",
  });

  if (!res.ok) return res as HbxResult<HbxActivityPage>;

  const parsed = hbxActivitiesResponseSchema.safeParse(res.data);
  if (!parsed.success) {
    return {
      ...res,
      ok: false,
      data: undefined,
      error: {
        code: "invalid-response",
        message: "The HBX activities content payload did not match the expected contract.",
        status: 502,
        retryable: false,
      },
    };
  }
  const environment = hbxEnvironment();
  const activities = (parsed.data.activities ?? []).map((a) => normaliseActivity(a, environment));
  return {
    ...res,
    data: {
      activities,
      total: parsed.data.total ?? parsed.data.pagination?.total ?? activities.length,
      offset: params.offset,
    },
  };
}

/** Static reference data: countries, currencies, languages, segments. */
export async function fetchActivityReference(
  resource: "countries" | "currencies" | "languages" | "segments",
  language = "en",
): Promise<HbxResult<unknown>> {
  return hbxCall<unknown>({
    suite: "activities",
    path: CFG.contentEndpoints[resource]!,
    query: { language },
    operation: `activities.content.${resource}`,
  });
}

/**
 * Activities cache/booking availability. Wired against the documented
 * operation; returns the normalised error surface until the suite is certified.
 */
export async function fetchActivityAvailability(params: {
  destination: string;
  from: string;
  to: string;
  language?: string;
  adults?: number;
  children?: number;
}): Promise<HbxResult<unknown>> {
  return hbxCall<unknown>({
    suite: "activities",
    api: "booking",
    path: CFG.bookingEndpoints["availability"]!,
    method: "POST",
    cacheTtlSeconds: 0,
    body: {
      filters: [{ searchFilterItems: [{ type: "destination", value: params.destination }] }],
      from: params.from,
      to: params.to,
      language: params.language ?? "en",
      paxes: [
        ...Array.from({ length: params.adults ?? 2 }, () => ({ age: 30 })),
        ...Array.from({ length: params.children ?? 0 }, () => ({ age: 8 })),
      ],
      pagination: { itemsPerPage: 50, page: 1 },
    },
    operation: "activities.booking.availability",
  });
}
