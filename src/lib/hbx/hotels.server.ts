// HBX Hotel Content API adapter (+ Hotel Booking API readiness).
import { HBX_SUITE_CONFIG } from "./config";
import { hbxCall, hbxEnvironment } from "./client.server";
import { normaliseHotel } from "./normalize";
import { hbxHotelsResponseSchema, type HbxHotelProduct, type HbxResult } from "./types";

const CFG = HBX_SUITE_CONFIG.hotels;

export interface HbxHotelPage {
  hotels: HbxHotelProduct[];
  total: number;
  from: number;
  to: number;
}

/**
 * Paginated hotel content crawl. `lastUpdateTime` drives HBX's incremental
 * mode: only hotels changed since that date are returned.
 */
export async function fetchHotelContentPage(params: {
  from: number;
  to: number;
  language?: string;
  countryCode?: string;
  destinationCode?: string;
  lastUpdateTime?: string;
  useSecondaryLanguage?: boolean;
}): Promise<HbxResult<HbxHotelPage>> {
  const res = await hbxCall<unknown>({
    suite: "hotels",
    path: CFG.contentEndpoints["hotels"]!,
    query: {
      fields: "all",
      language: params.language ?? "ENG",
      from: params.from,
      to: params.to,
      useSecondaryLanguage: params.useSecondaryLanguage ?? false,
      countryCode: params.countryCode,
      destinationCode: params.destinationCode,
      lastUpdateTime: params.lastUpdateTime,
    },
    operation: "hotels.content.page",
  });
  if (!res.ok) return res as HbxResult<HbxHotelPage>;

  const parsed = hbxHotelsResponseSchema.safeParse(res.data);
  if (!parsed.success) {
    return {
      ...res,
      ok: false,
      error: {
        code: "invalid-response",
        message: "The HBX hotel content payload did not match the expected contract.",
        status: 502,
        retryable: false,
      },
      data: undefined,
    };
  }
  const environment = hbxEnvironment();
  const hotels = (parsed.data.hotels ?? []).map((h) => normaliseHotel(h, environment));
  return {
    ...res,
    data: {
      hotels,
      total: parsed.data.total ?? hotels.length,
      from: parsed.data.from ?? params.from,
      to: parsed.data.to ?? params.to,
    },
  };
}

export async function fetchHotelDetail(
  code: string,
  language = "ENG",
): Promise<HbxResult<HbxHotelProduct | null>> {
  const res = await hbxCall<{ hotel?: unknown }>({
    suite: "hotels",
    path: CFG.contentEndpoints["hotelDetail"]!.replace("{code}", encodeURIComponent(code)),
    query: { language, useSecondaryLanguage: false },
    operation: "hotels.content.detail",
  });
  if (!res.ok) return res as HbxResult<HbxHotelProduct | null>;
  const raw = (res.data as { hotel?: unknown } | null)?.hotel;
  if (!raw) return { ...res, data: null };
  const parsed = hbxHotelsResponseSchema.shape.hotels.unwrap().element.safeParse(raw);
  if (!parsed.success) return { ...res, data: null };
  return { ...res, data: normaliseHotel(parsed.data, hbxEnvironment()) };
}

/** Static reference data: destinations, facilities, categories, boards, segments. */
export async function fetchHotelReference(
  resource: "destinations" | "countries" | "facilities" | "categories" | "boards" | "segments",
  params: { from?: number; to?: number; language?: string; countryCodes?: string } = {},
): Promise<HbxResult<unknown>> {
  return hbxCall<unknown>({
    suite: "hotels",
    path: CFG.contentEndpoints[resource]!,
    query: {
      fields: "all",
      language: params.language ?? "ENG",
      from: params.from ?? 1,
      to: params.to ?? 1000,
      countryCodes: params.countryCodes,
    },
    operation: `hotels.content.${resource}`,
  });
}

/**
 * Hotel Booking API readiness probe. The Booking API uses the same credential
 * pair; `/status` is the documented liveness operation and creates nothing.
 */
export async function probeHotelBookingApi(): Promise<HbxResult<unknown>> {
  return hbxCall<unknown>({
    suite: "hotels",
    api: "booking",
    path: CFG.bookingEndpoints["status"]!,
    cacheTtlSeconds: 0,
    operation: "hotels.booking.status",
  });
}
