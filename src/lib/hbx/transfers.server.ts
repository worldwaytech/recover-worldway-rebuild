// HBX Transfers Cache API adapter (+ Transfers Booking API readiness).
import { HBX_SUITE_CONFIG } from "./config";
import { hbxCall, hbxEnvironment } from "./client.server";
import { normaliseTransferRoute } from "./normalize";
import {
  buildAvailabilityPath,
  buildBookingBody,
  normaliseAvailability,
  normaliseBooking,
  normaliseBookingList,
  validateBookingInput,
  type TransferAvailability,
  type TransferAvailabilityQuery,
  type TransferBookingInput,
  type TransferBookingRecord,
} from "./transfer-model";
import {
  hbxTransferRoutesResponseSchema,
  type HbxResult,
  type HbxTransferProduct,
} from "./types";

const CFG = HBX_SUITE_CONFIG.transfers;

export interface HbxTransferPage {
  routes: HbxTransferProduct[];
  total: number;
}

/** Static route catalogue for a country (airports/ports/stations ↔ hotels/zones). */
export async function fetchTransferRoutes(params: {
  countryCode: string;
  language?: string;
  destinationCode?: string;
}): Promise<HbxResult<HbxTransferPage>> {
  const res = await hbxCall<unknown>({
    suite: "transfers",
    path: CFG.contentEndpoints["routes"]!,
    query: {
      language: params.language ?? "en",
      countryCodes: params.countryCode,
      destinationCodes: params.destinationCode,
    },
    operation: "transfers.cache.routes",
  });
  if (!res.ok) return res as HbxResult<HbxTransferPage>;

  const parsed = hbxTransferRoutesResponseSchema.safeParse(res.data);
  if (!parsed.success) {
    return {
      ...res,
      ok: false,
      data: undefined,
      error: {
        code: "invalid-response",
        message: "The HBX transfers route payload did not match the expected contract.",
        status: 502,
        retryable: false,
      },
    };
  }
  const environment = hbxEnvironment();
  const routes = (parsed.data.routes ?? []).map((r) => normaliseTransferRoute(r, environment));
  return { ...res, data: { routes, total: parsed.data.total ?? routes.length } };
}

/** Static reference data: countries, destinations, terminals, hotels, vehicles. */
export async function fetchTransferReference(
  resource: "countries" | "destinations" | "terminals" | "hotels" | "vehicles" | "categories",
  params: { language?: string; countryCode?: string } = {},
): Promise<HbxResult<unknown>> {
  return hbxCall<unknown>({
    suite: "transfers",
    path: CFG.contentEndpoints[resource]!,
    query: { language: params.language ?? "en", countryCodes: params.countryCode },
    operation: `transfers.cache.${resource}`,
  });
}

// ------------------------------------------------------ booking API (live)

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(vars[k] ?? ""));
}

/** Live availability — never cached (rate keys are short-lived). */
export async function fetchTransferAvailability(
  query: TransferAvailabilityQuery,
): Promise<HbxResult<TransferAvailability>> {
  const res = await hbxCall<unknown>({
    suite: "transfers",
    api: "booking",
    path: buildAvailabilityPath(query),
    cacheTtlSeconds: 0,
    operation: "transfers.booking.availability",
  });
  // HBX answers 204 (empty body) when no service is available.
  if (!res.ok) return res as HbxResult<TransferAvailability>;
  return { ...res, data: normaliseAvailability(res.data ?? {}) };
}

/** POST /bookings — single attempt, never retried (non-idempotent). */
export async function createTransferBooking(
  input: TransferBookingInput,
): Promise<HbxResult<{ booking: TransferBookingRecord | null; raw: unknown }>> {
  const errors = validateBookingInput(input);
  if (errors.length) {
    return {
      ok: false,
      status: 400,
      error: { code: "supplier-error", message: errors.join(" "), status: 400, retryable: false },
    } as HbxResult<{ booking: TransferBookingRecord | null; raw: unknown }>;
  }
  const res = await hbxCall<unknown>({
    suite: "transfers",
    api: "booking",
    path: CFG.bookingEndpoints["booking"]!,
    method: "POST",
    body: buildBookingBody(input),
    cacheTtlSeconds: 0,
    noRetry: true,
    operation: "transfers.booking.create",
  });
  if (!res.ok) return res as HbxResult<{ booking: TransferBookingRecord | null; raw: unknown }>;
  return { ...res, data: { booking: normaliseBooking(res.data), raw: res.data } };
}

export async function getTransferBooking(
  reference: string,
  language = "en",
): Promise<HbxResult<TransferBookingRecord | null>> {
  const res = await hbxCall<unknown>({
    suite: "transfers",
    api: "booking",
    path: fill(CFG.bookingEndpoints["bookingDetail"]!, { language, reference }),
    cacheTtlSeconds: 0,
    operation: "transfers.booking.detail",
  });
  if (!res.ok) return res as HbxResult<TransferBookingRecord | null>;
  return { ...res, data: normaliseBooking(res.data) };
}

export async function listTransferBookings(params: {
  fromDate: string;
  toDate: string;
  dateType?: "CREATION_DATE" | "FROM_DATE";
  language?: string;
}): Promise<HbxResult<ReturnType<typeof normaliseBookingList>>> {
  const res = await hbxCall<unknown>({
    suite: "transfers",
    api: "booking",
    path: fill(CFG.bookingEndpoints["bookingList"]!, { language: params.language ?? "en" }),
    query: { fromDate: params.fromDate, toDate: params.toDate, dateType: params.dateType ?? "CREATION_DATE" },
    cacheTtlSeconds: 0,
    operation: "transfers.booking.list",
  });
  if (!res.ok) return res as HbxResult<ReturnType<typeof normaliseBookingList>>;
  return { ...res, data: normaliseBookingList(res.data) };
}

/** DELETE booking — single attempt; callers re-read status on failure. */
export async function cancelTransferBooking(
  reference: string,
  language = "en",
): Promise<HbxResult<TransferBookingRecord | null>> {
  const res = await hbxCall<unknown>({
    suite: "transfers",
    api: "booking",
    path: fill(CFG.bookingEndpoints["cancellation"]!, { language, reference }),
    method: "DELETE",
    cacheTtlSeconds: 0,
    noRetry: true,
    operation: "transfers.booking.cancel",
  });
  if (!res.ok) return res as HbxResult<TransferBookingRecord | null>;
  return { ...res, data: normaliseBooking(res.data) };
}

// ----------------------------------------------------- content: points

export interface TransferPointRow {
  code: string;
  point_type: "ATLAS" | "IATA" | "PORT" | "STATION";
  name: string;
  country_code: string | null;
  destination_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  supplier_payload: unknown;
}

const TERMINAL_TYPE: Record<string, TransferPointRow["point_type"]> = { A: "IATA", P: "PORT", T: "STATION" };

/** Paginated Transfers Cache API content: terminals (airports/ports/stations) and hotels. */
export async function fetchTransferPointsPage(
  kind: "terminals" | "hotels",
  params: { countryCode: string; offset: number; limit: number; language?: string },
): Promise<HbxResult<TransferPointRow[]>> {
  const res = await hbxCall<unknown>({
    suite: "transfers",
    path: CFG.contentEndpoints[kind]!,
    query: {
      fields: "ALL",
      language: params.language ?? "en",
      countryCodes: params.countryCode,
      offset: params.offset,
      limit: params.limit,
    },
    cacheTtlSeconds: 0,
    operation: `transfers.content.${kind}`,
  });
  if (!res.ok) return res as HbxResult<TransferPointRow[]>;
  const list = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
  const rows: TransferPointRow[] = [];
  for (const r of list) {
    const coords = (r["coordinates"] ?? {}) as Record<string, unknown>;
    const lat = typeof coords["latitude"] === "number" ? (coords["latitude"] as number) : null;
    const lng = typeof coords["longitude"] === "number" ? (coords["longitude"] as number) : null;
    if (kind === "terminals") {
      const content = (r["content"] ?? {}) as Record<string, unknown>;
      const t = TERMINAL_TYPE[String(content["type"] ?? "")];
      if (!t || !r["code"]) continue;
      rows.push({
        code: String(r["code"]),
        point_type: t,
        name: String(content["description"] ?? r["code"]),
        country_code: (r["countryCode"] as string) ?? params.countryCode,
        destination_code: null,
        city: null,
        latitude: lat,
        longitude: lng,
        supplier_payload: r,
      });
    } else {
      if (!r["code"] || !r["name"]) continue;
      const { description: _d, ...slim } = r;
      rows.push({
        code: String(r["code"]),
        point_type: "ATLAS",
        name: String(r["name"]),
        country_code: (r["countryCode"] as string) ?? params.countryCode,
        destination_code: (r["destinationCode"] as string) ?? null,
        city: (r["city"] as string) ?? null,
        latitude: lat,
        longitude: lng,
        supplier_payload: slim,
      });
    }
  }
  return { ...res, data: rows };
}
