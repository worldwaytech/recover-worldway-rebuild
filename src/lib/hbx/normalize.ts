// HBX Group (Hotelbeds) — pure normalisation into WorldwayLuxe product models.
//
// No network, no secrets, no environment access: fully unit-testable and shared
// by the sync runtime, the catalogue read path and the tests.
import { HBX_SUPPLIER_ID, type HbxEnvironment } from "./config";
import type {
  HbxActivityProduct,
  HbxActivityRaw,
  HbxError,
  HbxHotelProduct,
  HbxHotelRaw,
  HbxText,
  HbxTransferProduct,
  HbxTransferRouteRaw,
} from "./types";

/** Unwraps HBX localised text nodes (`"x"` or `{ content: "x" }`). */
export function text(value: HbxText | undefined | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  const content = (value as { content?: unknown }).content;
  return typeof content === "string" ? content.trim() || null : null;
}

export function str(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || null;
  return null;
}

export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** HBX category codes look like `4EST`, `5LUX`, `3LL` — the leading digit is the star count. */
export function starsFromCategory(categoryCode: string | null): number | null {
  if (!categoryCode) return null;
  const match = /^(\d)(?:[.,]5)?/.exec(categoryCode);
  if (!match) return null;
  const stars = Number(match[1]);
  if (stars < 1 || stars > 5) return null;
  return /[.,]5/.test(categoryCode) ? stars + 0.5 : stars;
}

/** Hotel content images are CDN-relative; HBX serves them from this bucket. */
export const HBX_IMAGE_CDN = "https://photos.hotelbeds.com/giata/original/";

export function hotelImageUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${HBX_IMAGE_CDN}${path.replace(/^\/+/, "")}`;
}

export function normaliseHotel(raw: HbxHotelRaw, environment: HbxEnvironment): HbxHotelProduct {
  const code = String(raw.code);
  const categoryCode = str(raw.categoryCode);
  const images = (raw.images ?? [])
    .map((img, index) => ({
      url: img.path ? hotelImageUrl(img.path) : null,
      type: str(img.imageTypeCode),
      order: img.visualOrder ?? img.order ?? index,
    }))
    .filter((img): img is { url: string; type: string | null; order: number } => Boolean(img.url))
    .sort((a, b) => a.order - b.order);

  return {
    supplierId: HBX_SUPPLIER_ID,
    supplierCode: code,
    environment,
    suite: "hotels",
    supplierUpdatedAt: raw.lastUpdate ? new Date(raw.lastUpdate).toISOString() : null,
    code,
    name: text(raw.name) ?? `HBX hotel ${code}`,
    categoryCode,
    categoryName: text(raw.categoryName),
    starRating: starsFromCategory(categoryCode),
    destinationCode: str(raw.destinationCode),
    destinationName: text(raw.destinationName),
    zoneCode: str(raw.zoneCode),
    zoneName: text(raw.zoneName),
    countryCode: str(raw.countryCode),
    stateCode: str(raw.stateCode),
    city: text(raw.city),
    address: text(raw.address),
    postalCode: str(raw.postalCode),
    latitude: num(raw.coordinates?.latitude),
    longitude: num(raw.coordinates?.longitude),
    description: text(raw.description),
    facilities: (raw.facilities ?? [])
      .map((f) => ({
        code: str(f.facilityCode) ?? "",
        groupCode: str(f.facilityGroupCode),
        label: text(f.description),
      }))
      .filter((f) => f.code !== ""),
    images,
    boardCodes: (raw.boards ?? []).map((b) => str(b.code)).filter((c): c is string => Boolean(c)),
    segmentCodes: (raw.segmentCodes ?? []).map((s) => String(s)),
    phones: (raw.phones ?? [])
      .map((p) => str(p.phoneNumber))
      .filter((p): p is string => Boolean(p)),
    ranking: num(raw.ranking),
  };
}

export function normaliseActivity(
  raw: HbxActivityRaw,
  environment: HbxEnvironment,
): HbxActivityProduct {
  const code = String(raw.code);
  const destination = raw.destinations?.[0];
  const images = (raw.content?.media?.images ?? [])
    .flatMap((img) => (img.urls ?? []).map((u) => u.resource))
    .filter((u): u is string => Boolean(u));
  const categories = (raw.content?.segmentationGroups ?? []).flatMap((group) => {
    const items = (group.items ?? []).map((i) => text(i.name)).filter((v): v is string => Boolean(v));
    const label = text(group.name);
    return items.length ? items : label ? [label] : [];
  });
  const amounts = (raw.amountsFrom ?? [])
    .map((a) => num(a.amount))
    .filter((a): a is number => a != null);

  return {
    supplierId: HBX_SUPPLIER_ID,
    supplierCode: code,
    environment,
    suite: "activities",
    supplierUpdatedAt: null,
    code,
    name: text(raw.name) ?? `HBX experience ${code}`,
    type: str(raw.type),
    countryCode: str(raw.country?.code),
    destinationCode: str(destination?.code),
    destinationName: text(destination?.name),
    city: text(raw.content?.location?.city),
    categories: Array.from(new Set(categories)),
    description: text(raw.content?.description),
    highlights: (raw.content?.highlights ?? [])
      .map((h) => text(h))
      .filter((h): h is string => Boolean(h)),
    images: Array.from(new Set(images)),
    currency: str(raw.currency),
    amountFrom: amounts.length ? Math.min(...amounts) : null,
    duration: str(raw.content?.scheduling?.duration),
    latitude: num(raw.content?.location?.latitude),
    longitude: num(raw.content?.location?.longitude),
    languages: (raw.languages ?? [])
      .map((l) => (typeof l === "string" ? l : str((l as { code?: unknown }).code)))
      .filter((l): l is string => Boolean(l)),
  };
}

export function normaliseTransferRoute(
  raw: HbxTransferRouteRaw,
  environment: HbxEnvironment,
): HbxTransferProduct {
  const fromCode = str(raw.from?.code);
  const toCode = str(raw.to?.code);
  const code = str(raw.id) ?? str(raw.code) ?? `${fromCode ?? "?"}-${toCode ?? "?"}`;
  const categories = [...(raw.categories ?? []), ...(raw.vehicles ?? [])]
    .map((c) => ({ code: str(c.code) ?? "", label: text(c.name) }))
    .filter((c) => c.code !== "");

  return {
    supplierId: HBX_SUPPLIER_ID,
    supplierCode: code,
    environment,
    suite: "transfers",
    supplierUpdatedAt: null,
    code,
    fromType: str(raw.from?.type),
    fromCode,
    fromName: text(raw.from?.description) ?? text(raw.from?.name),
    toType: str(raw.to?.type),
    toCode,
    toName: text(raw.to?.description) ?? text(raw.to?.name),
    countryCode: str(raw.countryCode) ?? str(raw.country?.code),
    destinationCode: str(raw.destinationCode) ?? str(raw.destination?.code),
    destinationName: text(raw.destination?.name),
    vehicleCategories: categories,
  };
}

// ------------------------------------------------------------ error mapping

/**
 * Maps a supplier HTTP status onto the normalised WorldwayLuxe error surface.
 * Supplier messages are logged server-side; only safe copy is returned.
 */
export function normaliseHttpError(status: number, supplierMessage?: string): HbxError {
  if (status === 401 || status === 403)
    return {
      code: "unauthorised",
      message: "The HBX credentials were rejected for this product suite.",
      status,
      retryable: false,
    };
  if (status === 429)
    return {
      code: "rate-limited",
      message: "HBX rate limit reached — please retry in a moment.",
      status,
      retryable: true,
    };
  if (status === 408 || status === 504)
    return {
      code: "timeout",
      message: "HBX did not respond in time.",
      status,
      retryable: true,
    };
  if (status >= 500)
    return {
      code: "supplier-error",
      message: "HBX is temporarily unavailable.",
      status,
      retryable: true,
    };
  return {
    code: "supplier-error",
    message: supplierMessage ? "HBX rejected the request." : "The HBX request could not be completed.",
    status,
    retryable: false,
  };
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 0 || status >= 500;
}

/** Exponential backoff with jitter-free deterministic base (testable). */
export function backoffDelayMs(attempt: number, baseMs = 400, capMs = 8000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
