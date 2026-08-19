// HBX Transfers Cache API adapter (+ Transfers Booking API readiness).
import { HBX_SUITE_CONFIG } from "./config";
import { hbxCall, hbxEnvironment } from "./client.server";
import { normaliseTransferRoute } from "./normalize";
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

/**
 * Transfers Booking API availability. Wired against the documented operation
 * shape so certification flips it live without code changes.
 */
export async function fetchTransferAvailability(params: {
  fromType: string;
  fromCode: string;
  toType: string;
  toCode: string;
  outbound: string;
  adults?: number;
  children?: number;
  language?: string;
}): Promise<HbxResult<unknown>> {
  const path =
    `${CFG.bookingEndpoints["availability"]!}/from/${encodeURIComponent(params.fromType)}/` +
    `${encodeURIComponent(params.fromCode)}/to/${encodeURIComponent(params.toType)}/` +
    `${encodeURIComponent(params.toCode)}/outbound/${encodeURIComponent(params.outbound)}/` +
    `adults/${params.adults ?? 2}/children/${params.children ?? 0}/infants/0`;
  return hbxCall<unknown>({
    suite: "transfers",
    api: "booking",
    path,
    query: { language: params.language ?? "en" },
    cacheTtlSeconds: 0,
    operation: "transfers.booking.availability",
  });
}
