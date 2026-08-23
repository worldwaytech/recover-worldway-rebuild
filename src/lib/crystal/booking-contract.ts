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
  | "egress_not_confirmed"
  | "not_certified"
  | "credentials_missing";

/** One activation gate in the Crystal PROD readiness check. */
export type CrystalGateState = "green" | "amber" | "red" | "unknown";

export interface CrystalReadinessGate {
  id:
    | "connectivity"
    | "entitlement"
    | "sales_channel"
    | "office_id"
    | "egress"
    | "operations_mapped"
    | "read_only_verification"
    | "certification"
    | "activation";
  label: string;
  state: CrystalGateState;
  /** Human-readable status shown in the admin console (never a credential). */
  detail: string;
  /** Exact remaining blocker when the gate is not green. */
  blocker?: string;
}

export interface CrystalProdReadiness {
  generatedAt: string;
  /** True only when every gate is green; LIVE activation is refused otherwise. */
  readyForLive: boolean;
  /** Current value of the CRYSTAL_BOOKING_ENABLED switch. */
  bookingEnabledFlag: boolean;
  /** Whether the rail is actually armed right now (capability.live). */
  railArmed: boolean;
  gates: CrystalReadinessGate[];
  blockers: string[];
  /** Whether live read-only PROD probes were executed for this report. */
  probed: boolean;
}

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
  | "pastguest"
  | "invoice"
  | "paymentlink"
  | "paymentlinkretrieve"
  | "paymentstatus"
  | "pricebreakdown";

/**
 * Documented PROD operations from the AKTG Booking API specification
 * (the supplied YAML). Holds the exact paths, HTTP methods, and required
 * path parameters used to reach each operation. The server adapter treats this
 * as the source of truth and only ever calls a documented operation.
 *
 * - `path`: exact path from the spec. Path parameters are expressed as
 *   `{name}` and substituted from caller-supplied values at request time.
 * - `method`: exact HTTP method from the spec.
 * - `requiredPathParams`: path parameters the spec marks required.
 * - `envVar`: optional server-side override so an agency can pin a different
 *   deployed path; empty by default, meaning the spec path is used verbatim.
 */
export interface CrystalOperationSpec {
  operation: CrystalBookingOperation;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  requiredPathParams: string[];
  /** Name of the optional server-side env override for the path ("" = none). */
  envVar: string;
}

/**
 * The operation catalogue, derived solely from the supplied AKTG Booking API
 * (PROD) specification. Clone paths and net-fare-only variants are excluded;
 * every endpoint listed here is a real, documented operation in the spec.
 */
export const CRYSTAL_BOOKING_SPEC: CrystalOperationSpec[] = [
  // Hold / release suites (Hold and Release are separate ops, same path)
  { operation: "prebook", path: "/v1/Bookings/suites", method: "POST", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PREBOOK" },
  { operation: "suites", path: "/v1/Bookings/suites", method: "DELETE", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_SUITES" },
  // Quote / Option / Promote lifecycle
  { operation: "quote", path: "/v1/Bookings/quote", method: "POST", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_QUOTE" },
  { operation: "option", path: "/v1/Bookings/option", method: "POST", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_OPTION" },
  { operation: "modify", path: "/v1/Bookings/{bookingId}/promote", method: "PUT", requiredPathParams: ["bookingId"], envVar: "CRYSTAL_BOOKING_PATH_MODIFY" },
  // Retrieve / cancel a specific booking
  { operation: "retrieve", path: "/v1/Bookings/{bookingId}", method: "GET", requiredPathParams: ["bookingId"], envVar: "CRYSTAL_BOOKING_PATH_RETRIEVE" },
  { operation: "cancel", path: "/v1/Bookings/{bookingId}", method: "DELETE", requiredPathParams: ["bookingId"], envVar: "CRYSTAL_BOOKING_PATH_CANCEL" },
  { operation: "history", path: "/v1/bookings/history/{bookingId}", method: "GET", requiredPathParams: ["bookingId"], envVar: "CRYSTAL_BOOKING_PATH_HISTORY" },
  // List bookings created by the agency
  { operation: "list", path: "/v1/Bookings", method: "GET", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_LIST" },
  // Availability / suites / pricing
  { operation: "availability", path: "/d/v1/cruises/availability", method: "GET", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_AVAILABILITY" },
  { operation: "netfares", path: "/d/v1/netfare/availablesuites", method: "GET", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_NETFARES" },
  { operation: "pricetypes", path: "/v1/Bookings/pricetypescurrencies", method: "GET", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PRICETYPES" },
  { operation: "promotions", path: "/d/v1/wsPromo/CruiseCategoryPromo", method: "GET", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PROMOTIONS" },
  // Guest and pricing helpers
  { operation: "pastguest", path: "/v1/PastGuests/search", method: "GET", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PASTGUEST" },
  { operation: "pricebreakdown", path: "/v2/bookings/pricebreakdown", method: "POST", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PRICEBREAKDOWN" },
  // Document / payment delivery + retrieval
  { operation: "invoice", path: "/v1/Bookings/{bookingId}/invoice", method: "POST", requiredPathParams: ["bookingId"], envVar: "CRYSTAL_BOOKING_PATH_INVOICE" },
  { operation: "paymentlink", path: "/v1/Bookings/{bookingId}/paymentlink", method: "POST", requiredPathParams: ["bookingId"], envVar: "CRYSTAL_BOOKING_PATH_PAYMENTLINK" },
  { operation: "paymentlinkretrieve", path: "/v1/RetrievePaymentLink/paymentlink", method: "POST", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PAYMENTLINKRETRIEVE" },
  { operation: "paymentstatus", path: "/v1/payments/requestInfo", method: "POST", requiredPathParams: [], envVar: "CRYSTAL_BOOKING_PATH_PAYMENTSTATUS" },
];

/** Operations that must be reachable before the rail can arm. */
export const CRYSTAL_REQUIRED_OPERATIONS: CrystalBookingOperation[] = [
  "prebook",
  "option",
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
  "pricebreakdown",
];

export const CRYSTAL_ALL_OPERATIONS: CrystalBookingOperation[] =
  CRYSTAL_BOOKING_SPEC.map((s) => s.operation);

export interface CrystalOperationStatus {
  operation: CrystalBookingOperation;
  configured: boolean;
  required: boolean;
  readOnly: boolean;
  /** Documented PROD method for this operation (never guessed). */
  method: string;
  /** Name of the optional server-side env var that overrides this path ("" = none). */
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
  /** Allocated suite number (AKTG VoyageSuiteRequest.suiteNumber, int32). */
  suiteNumber: z.number().int().positive().max(999_999).optional(),
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
