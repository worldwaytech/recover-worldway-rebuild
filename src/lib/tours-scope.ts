// Pure helpers for classifying the tour supplier's write (booking) permission.
// Shared by the server connector, the admin diagnostics and the tests.

export type ToursWriteScope = "READ_ONLY" | "BOOKING_ENABLED" | "UNKNOWN";

/**
 * Classifies the supplier response to a deliberately invalid `POST /bookings`
 * probe:
 *  - 401/403 → the application key has no booking write scope (READ_ONLY)
 *  - 400/409/422 → the write was accepted for validation and rejected on
 *    payload grounds, which proves the scope is enabled (BOOKING_ENABLED)
 *  - anything else (network, 5xx, rate limit) → UNKNOWN, never asserted
 */
export function classifyWriteScope(status: number): ToursWriteScope {
  if (status === 401 || status === 403) return "READ_ONLY";
  if (status === 400 || status === 409 || status === 422) return "BOOKING_ENABLED";
  if (status >= 200 && status < 300) return "BOOKING_ENABLED";
  return "UNKNOWN";
}

/** True when a failed reservation was caused by the missing write scope. */
export function isWriteScopeDenied(status: number): boolean {
  return status === 401 || status === 403;
}

export function writeScopeLabel(scope: ToursWriteScope): string {
  if (scope === "BOOKING_ENABLED") return "Booking enabled";
  if (scope === "READ_ONLY") return "Read only";
  return "Unknown";
}

/** Traveller-facing copy for a reservation that could not be held live. */
export function fallbackMessage(opts: {
  writeScopeDenied: boolean;
  captured: boolean;
  supplierError?: string | undefined;
}): string {
  if (opts.writeScopeDenied) {
    return opts.captured
      ? "We could not place an instant hold with the operator for this departure. No booking has been created and you have not been charged — our travel desk has your request and will confirm availability and secure your places, usually within the hour."
      : "We could not place an instant hold with the operator for this departure, and no booking has been created. Please contact our travel desk at concierge@worldwaytravelsgroup.com so we can secure your places straight away.";
  }
  const base = opts.supplierError ?? "The reservation could not be completed.";
  return opts.captured
    ? `${base} No booking has been created and you have not been charged — our travel desk has your details and will follow up.`
    : `${base} No booking has been created. Please contact our travel desk so we can help.`;
}
