// Component classification — pure. Derived from the capability registry and
// live revalidation evidence only; never promoted by hand.
import { bookingBlockers } from "./capabilities";
import type { CanonicalOffer } from "./normalize";
import type { SupplierRegistration } from "./types";

export type ComponentStatus = "LIVE" | "AVAILABLE" | "ON_REQUEST" | "UNAVAILABLE" | "BOOKABLE";

/** Search results older than this must be revalidated again. */
export const OFFER_TTL_MINUTES = 15;

export function isFresh(iso: string | undefined, now = Date.now(), ttlMin = OFFER_TTL_MINUTES) {
  return !!iso && now - Date.parse(iso) <= ttlMin * 60_000;
}

export function classifyOffer(
  o: CanonicalOffer,
  reg: SupplierRegistration | undefined,
  opts: { rejected?: boolean; priced?: boolean; now?: number } = {},
): ComponentStatus {
  if (opts.rejected) return "UNAVAILABLE";
  if (!reg || reg.readiness !== "production") return "ON_REQUEST"; // sandbox / UAT / blocked
  const confirmed = isFresh(o.revalidatedAt, opts.now);
  if (!confirmed) return "LIVE";
  return bookingBlockers(reg).length === 0 && opts.priced ? "BOOKABLE" : "AVAILABLE";
}
