// HBX Group (Hotelbeds) — typed contracts and normalised WorldwayLuxe models.
//
// Supplier schemas are deliberately permissive (`.passthrough()`, optional
// fields): HBX ships localised `{ content: string }` wrappers, evolves payloads
// per contract, and content differs between the Hotels, Activities and
// Transfers suites. We validate the fields we depend on and keep the untouched
// supplier record for traceability, rather than rejecting whole pages.
import { z } from "zod";
import type { HbxEnvironment, HbxSuite } from "./config";

/** HBX localised text node: either a plain string or `{ content }`. */
export const hbxText = z.union([
  z.string(),
  z.object({ content: z.string().optional() }).passthrough(),
]);
export type HbxText = z.infer<typeof hbxText>;

// ---------------------------------------------------------------- hotels

export const hbxHotelSchema = z
  .object({
    code: z.union([z.number(), z.string()]),
    name: hbxText.optional(),
    description: hbxText.optional(),
    countryCode: z.string().optional(),
    stateCode: z.string().optional(),
    destinationCode: z.string().optional(),
    destinationName: hbxText.optional(),
    zoneCode: z.union([z.number(), z.string()]).optional(),
    zoneName: hbxText.optional(),
    city: hbxText.optional(),
    address: hbxText.optional(),
    postalCode: z.string().optional(),
    categoryCode: z.string().optional(),
    categoryName: hbxText.optional(),
    ranking: z.number().optional(),
    lastUpdate: z.string().optional(),
    coordinates: z
      .object({ latitude: z.number().optional(), longitude: z.number().optional() })
      .passthrough()
      .optional(),
    phones: z.array(z.object({ phoneNumber: z.string().optional() }).passthrough()).optional(),
    images: z
      .array(
        z
          .object({
            path: z.string().optional(),
            imageTypeCode: z.string().optional(),
            order: z.number().optional(),
            visualOrder: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    facilities: z
      .array(
        z
          .object({
            facilityCode: z.union([z.number(), z.string()]).optional(),
            facilityGroupCode: z.union([z.number(), z.string()]).optional(),
            description: hbxText.optional(),
          })
          .passthrough(),
      )
      .optional(),
    boards: z.array(z.object({ code: z.string().optional() }).passthrough()).optional(),
    segmentCodes: z.array(z.union([z.number(), z.string()])).optional(),
  })
  .passthrough();
export type HbxHotelRaw = z.infer<typeof hbxHotelSchema>;

export const hbxHotelsResponseSchema = z
  .object({
    hotels: z.array(hbxHotelSchema).optional(),
    total: z.number().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
    auditData: z.unknown().optional(),
  })
  .passthrough();

// ------------------------------------------------------------- activities

export const hbxActivitySchema = z
  .object({
    code: z.union([z.number(), z.string()]),
    name: hbxText.optional(),
    type: z.string().optional(),
    country: z
      .object({ code: z.string().optional(), name: hbxText.optional() })
      .passthrough()
      .optional(),
    destinations: z
      .array(
        z
          .object({
            code: z.string().optional(),
            name: hbxText.optional(),
            type: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    currency: z.string().optional(),
    amountsFrom: z
      .array(
        z
          .object({ amount: z.union([z.number(), z.string()]).optional() })
          .passthrough(),
      )
      .optional(),
    content: z
      .object({
        description: hbxText.optional(),
        media: z
          .object({
            images: z
              .array(
                z
                  .object({
                    urls: z
                      .array(z.object({ resource: z.string().optional() }).passthrough())
                      .optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
        segmentationGroups: z
          .array(
            z
              .object({
                code: z.string().optional(),
                name: hbxText.optional(),
                items: z
                  .array(z.object({ code: z.string().optional(), name: hbxText.optional() }).passthrough())
                  .optional(),
              })
              .passthrough(),
          )
          .optional(),
        highlights: z.array(hbxText).optional(),
        scheduling: z
          .object({ duration: z.union([z.string(), z.number()]).optional() })
          .passthrough()
          .optional(),
        location: z
          .object({
            latitude: z.union([z.number(), z.string()]).optional(),
            longitude: z.union([z.number(), z.string()]).optional(),
            city: hbxText.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    languages: z.array(z.union([z.string(), z.object({}).passthrough()])).optional(),
  })
  .passthrough();
export type HbxActivityRaw = z.infer<typeof hbxActivitySchema>;

export const hbxActivitiesResponseSchema = z
  .object({
    activities: z.array(hbxActivitySchema).optional(),
    total: z.number().optional(),
    pagination: z
      .object({ total: z.number().optional(), offset: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

// -------------------------------------------------------------- transfers

const hbxTransferPointSchema = z
  .object({
    type: z.string().optional(),
    code: z.union([z.number(), z.string()]).optional(),
    description: hbxText.optional(),
    name: hbxText.optional(),
  })
  .passthrough();

export const hbxTransferRouteSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    code: z.union([z.number(), z.string()]).optional(),
    from: hbxTransferPointSchema.optional(),
    to: hbxTransferPointSchema.optional(),
    countryCode: z.string().optional(),
    country: z.object({ code: z.string().optional() }).passthrough().optional(),
    destinationCode: z.string().optional(),
    destination: z
      .object({ code: z.string().optional(), name: hbxText.optional() })
      .passthrough()
      .optional(),
    vehicles: z
      .array(
        z
          .object({ code: z.union([z.number(), z.string()]).optional(), name: hbxText.optional() })
          .passthrough(),
      )
      .optional(),
    categories: z
      .array(
        z
          .object({ code: z.union([z.number(), z.string()]).optional(), name: hbxText.optional() })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type HbxTransferRouteRaw = z.infer<typeof hbxTransferRouteSchema>;

export const hbxTransferRoutesResponseSchema = z
  .object({
    routes: z.array(hbxTransferRouteSchema).optional(),
    total: z.number().optional(),
  })
  .passthrough();

// --------------------------------------------- normalised WorldwayLuxe models

/** Common provenance carried by every normalised HBX product. */
export interface HbxProvenance {
  supplierId: string;
  supplierCode: string;
  environment: HbxEnvironment;
  suite: HbxSuite;
  supplierUpdatedAt: string | null;
}

export interface HbxHotelProduct extends HbxProvenance {
  code: string;
  name: string;
  categoryCode: string | null;
  categoryName: string | null;
  starRating: number | null;
  destinationCode: string | null;
  destinationName: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  countryCode: string | null;
  stateCode: string | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  facilities: { code: string; groupCode: string | null; label: string | null }[];
  images: { url: string; type: string | null; order: number }[];
  boardCodes: string[];
  segmentCodes: string[];
  phones: string[];
  ranking: number | null;
}

export interface HbxActivityProduct extends HbxProvenance {
  code: string;
  name: string;
  type: string | null;
  countryCode: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  city: string | null;
  categories: string[];
  description: string | null;
  highlights: string[];
  images: string[];
  currency: string | null;
  amountFrom: number | null;
  duration: string | null;
  latitude: number | null;
  longitude: number | null;
  languages: string[];
}

export interface HbxTransferProduct extends HbxProvenance {
  code: string;
  fromType: string | null;
  fromCode: string | null;
  fromName: string | null;
  toType: string | null;
  toCode: string | null;
  toName: string | null;
  countryCode: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  vehicleCategories: { code: string; label: string | null }[];
}

/** Normalised error surface — supplier internals never reach the client. */
export interface HbxError {
  code:
    | "not-configured"
    | "disabled"
    | "unauthorised"
    | "rate-limited"
    | "timeout"
    | "supplier-error"
    | "invalid-response"
    | "network";
  message: string;
  status: number;
  retryable: boolean;
}

export interface HbxResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: HbxError;
  /** Observability: attempts made, duration and whether a cached copy was served. */
  meta: {
    suite: HbxSuite;
    environment: HbxEnvironment;
    attempts: number;
    durationMs: number;
    fromCache: boolean;
    requestId: string;
  };
}
