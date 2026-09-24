// Server-only Bókun/OCTO booking chain. HARD GATED: every write refuses to
// run unless BOKUN_BOOKING_ENABLED === "true" in the server environment. That
// flag is only set after the credential environment (TEST vs LIVE) has been
// verified and the operator has explicitly confirmed bookings may be created.

import { BOKUN_BOOKING_FLAG, BOKUN_LIMITS, BOKUN_OCTO_ENDPOINTS } from "./config";
import { BokunError, activeEnvironment, octoFetch } from "./client.server";

export function bookingsEnabled(): boolean {
  return (process.env[BOKUN_BOOKING_FLAG] ?? "").trim().toLowerCase() === "true";
}

export class BookingDisabledError extends Error {
  constructor() {
    super(
      "Bókun bookings are disabled until the credential environment has been verified and bookings explicitly enabled.",
    );
    this.name = "BookingDisabledError";
  }
}

function assertBookingsEnabled() {
  if (!bookingsEnabled()) throw new BookingDisabledError();
}

export interface OctoAvailabilityRequest {
  productId: string;
  optionId?: string;
  localDateStart: string; // YYYY-MM-DD
  localDateEnd: string;
  units: Array<{ id: string; quantity: number }>;
}

export async function octoAvailability(req: OctoAvailabilityRequest) {
  // Read-only: allowed even while bookings are disabled.
  return octoFetch(BOKUN_OCTO_ENDPOINTS.availability, {
    method: "POST",
    body: req,
  });
}

export interface OctoBookingCreateRequest {
  productId: string;
  optionId?: string;
  availabilityId: string;
  unitItems: Array<{ unitId: string }>;
  contact: { fullName: string; emailAddress: string; phoneNumber?: string };
  notes?: string;
  /** Our internal reference, sent as bookingReference for reconciliation. */
  bookingReference?: string;
}

export async function octoCreateBooking(req: OctoBookingCreateRequest) {
  assertBookingsEnabled();
  return octoFetch(BOKUN_OCTO_ENDPOINTS.bookings, {
    method: "POST",
    body: req,
    retry: false,
    timeoutMs: BOKUN_LIMITS.bookingTimeoutMs,
  });
}

export async function octoConfirmBooking(uuid: string) {
  assertBookingsEnabled();
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new BokunError("Invalid booking uuid.", 400, activeEnvironment(), uuid);
  return octoFetch(BOKUN_OCTO_ENDPOINTS.booking.replace("{uuid}", uuid), {
    method: "PATCH",
    body: { status: "CONFIRMED" },
    retry: false,
    timeoutMs: BOKUN_LIMITS.bookingTimeoutMs,
  });
}

export async function octoCancelBooking(uuid: string, reason?: string) {
  assertBookingsEnabled();
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new BokunError("Invalid booking uuid.", 400, activeEnvironment(), uuid);
  return octoFetch(BOKUN_OCTO_ENDPOINTS.booking.replace("{uuid}", uuid), {
    method: "PATCH",
    body: { status: "CANCELLED", ...(reason ? { cancellationReason: reason.slice(0, 200) } : {}) },
    retry: false,
    timeoutMs: BOKUN_LIMITS.bookingTimeoutMs,
  });
}

/** Read-only status lookup — safe to call any time. */
export async function octoGetBooking(uuid: string) {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new BokunError("Invalid booking uuid.", 400, activeEnvironment(), uuid);
  return octoFetch(BOKUN_OCTO_ENDPOINTS.booking.replace("{uuid}", uuid));
}
