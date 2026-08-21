// Client-safe contract for the Crystal Cruises booking chain.
// No supplier credentials, endpoints or secrets appear here.
import { z } from "zod";

export const CRYSTAL_PRODUCT_TYPE = "crystal-cruise" as const;

/** Reasons the supplier booking rail can be unavailable (fail-closed). */
export type CrystalBookingBlockReason =
  | "booking_api_not_authorised"
  | "booking_api_not_configured"
  | "booking_api_disabled"
  | "channel_context_missing"
  | "credentials_missing";

/** Server-side supplier channel context required on every booking call. */
export interface CrystalChannelContextState {
  salesChannelConfigured: boolean;
  officeIdConfigured: boolean;
}

export interface CrystalBookingCapability {
  /** True only when every documented booking operation is configured and enabled. */
  live: boolean;
  /** Operations the account is currently authorised to call. */
  operations: CrystalBookingOperation[];
  reason?: CrystalBookingBlockReason;
  detail: string;
  shoppingApiStatus: string;
  bookingApiStatus: string;
  /** Presence-only view of X-SalesChannel / X-OfficeID (values never leave the server). */
  channel: CrystalChannelContextState;
}

export type CrystalBookingOperation =
  | "prebook"
  | "quote"
  | "option"
  | "create"
  | "retrieve"
  | "history"
  | "list"
  | "modify"
  | "cancel"
  | "availability"
  | "suites"
  | "netfares"
  | "pricetypes"
  | "promotions"
  | "pastguest";

/** Operations that must be configured before the rail can arm. */
export const CRYSTAL_REQUIRED_OPERATIONS: CrystalBookingOperation[] = [
  "prebook",
  "create",
  "retrieve",
  "cancel",
];

/** Supporting operations: optional, and safe to call read-only when configured. */
export const CRYSTAL_READ_ONLY_OPERATIONS: CrystalBookingOperation[] = [
  "retrieve",
  "history",
  "list",
  "availability",
  "suites",
  "netfares",
  "pricetypes",
  "promotions",
  "pastguest",
];

export const CRYSTAL_ALL_OPERATIONS: CrystalBookingOperation[] = [
  "prebook",
  "quote",
  "option",
  "create",
  "retrieve",
  "history",
  "list",
  "modify",
  "cancel",
  "availability",
  "suites",
  "netfares",
  "pricetypes",
  "promotions",
  "pastguest",
];

export interface CrystalOperationStatus {
  operation: CrystalBookingOperation;
  configured: boolean;
  required: boolean;
  readOnly: boolean;
  /** Name of the server-side env var that supplies this operation's PROD path. */
  envVar: string;
}

export const guestSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  nationality: z.string().trim().min(2).max(56).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().min(6).max(32).optional(),
});
export type CrystalGuest = z.infer<typeof guestSchema>;

export const holdInputSchema = z.object({
  voyageNumber: z.string().trim().min(3).max(40),
  voyageTitle: z.string().trim().min(1).max(200),
  shipName: z.string().trim().max(120).optional(),
  departureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  currency: z.string().trim().length(3),
  fareCode: z.string().trim().max(40).optional(),
  gradeId: z.string().trim().max(40).optional(),
  suiteCategory: z.string().trim().max(40),
  /** Per-guest fare the customer saw; re-validated server-side before any hold. */
  quotedPricePerGuest: z.number().finite().positive().max(2_000_000),
  guests: z.array(guestSchema).min(1).max(4),
  leadEmail: z.string().trim().email().max(160),
  leadPhone: z.string().trim().min(6).max(32),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});
export type CrystalHoldInput = z.infer<typeof holdInputSchema>;

export const confirmInputSchema = z.object({
  bookingId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
  acceptedTerms: z.literal(true),
});

export const cancelInputSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

/** WorldwayLuxe booking lifecycle states used by the Crystal rail. */
export type CrystalBookingStatus =
  | "held"
  | "awaiting_supplier"
  | "pending_confirmation"
  | "confirmed"
  | "cancellation_requested"
  | "cancelled"
  | "failed";

/** Map any AKTG/Crystal supplier status string onto our lifecycle. */
export function mapSupplierStatus(raw: string | undefined | null): CrystalBookingStatus {
  const v = (raw ?? "").toLowerCase();
  if (!v) return "awaiting_supplier";
  if (v.includes("cancel")) return "cancelled";
  if (v.includes("confirm") || v === "ok" || v.includes("book")) return "confirmed";
  if (v.includes("option") || v.includes("hold") || v.includes("provision")) return "held";
  if (v.includes("wait") || v.includes("pending") || v.includes("request"))
    return "pending_confirmation";
  if (v.includes("fail") || v.includes("error") || v.includes("declin")) return "failed";
  return "awaiting_supplier";
}

export const STATUS_LABELS: Record<CrystalBookingStatus, string> = {
  held: "Suite held",
  awaiting_supplier: "Awaiting Crystal confirmation",
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  cancellation_requested: "Cancellation requested",
  cancelled: "Cancelled",
  failed: "Could not be completed",
};

export interface CrystalBookingRecord {
  id: string;
  reference: string;
  status: CrystalBookingStatus;
  voyageNumber: string;
  title: string;
  shipName?: string;
  travelDate?: string;
  suiteCategory?: string;
  currency: string;
  amount?: number;
  amountPaid: number;
  balanceDue: number;
  supplierReference?: string;
  supplierStatus?: string;
  guests: number;
  createdAt: string;
  updatedAt: string;
  /** Present when the supplier rail is not yet authorised for this account. */
  supplierPending?: boolean;
  cancellationReason?: string;
}
