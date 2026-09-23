// Worldway customer voucher for RateHawk hotel bookings — pure, client-safe.
//
// A voucher is only ever produced for a booking the supplier has confirmed
// (internal status "confirmed"). Pending, sold-out, book-limit, cancelled and
// unresolved bookings produce no voucher.
import type { RatehawkCancellationPolicy } from "./types";
import type { WorldwayCustomerPrice } from "./pricing";

/** Worldway's own lifecycle status, resolved from the supplier's answer. */
export type RatehawkInternalStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "failed-soldout"
  | "failed-book-limit"
  | "failed";

/** Maps a RateHawk envelope status / error slug onto our internal status. */
export function mapRatehawkStatus(args: {
  supplierStatus?: string | null;
  dataStatus?: string | null;
  errorCode?: string | null;
  orderStatus?: string | null;
}): RatehawkInternalStatus {
  const order = (args.orderStatus ?? "").toLowerCase();
  if (order === "cancelled" || order === "canceled") return "cancelled";
  if (order === "completed") return "confirmed";

  const error = (args.errorCode ?? "").toLowerCase();
  if (error === "soldout") return "failed-soldout";
  if (error === "book_limit") return "failed-book-limit";
  // "unknown" is never terminal: the caller must resolve it against the
  // authoritative status/order endpoints before a status is reported.
  if (error === "unknown" || error === "") {
    const state = (args.dataStatus ?? args.supplierStatus ?? "").toLowerCase();
    if (state === "ok" || state === "completed") return "confirmed";
    if (state === "processing" || state === "3ds" || state === "") return "pending";
    if (state === "cancelled" || state === "canceled") return "cancelled";
    return "pending";
  }
  return "failed";
}

export interface WorldwayVoucherInput {
  worldwayReference: string;
  ratehawkOrderId: string | number | null;
  status: RatehawkInternalStatus;
  hotelName: string | null;
  hotelId: string | null;
  hid: number | null;
  checkin: string;
  checkout: string;
  roomName: string | null;
  mealType: string | null;
  guests: { firstName: string; lastName: string }[];
  price: WorldwayCustomerPrice | null;
  cancellationPolicies: RatehawkCancellationPolicy[];
  freeCancellationBefore?: string | null;
}

export interface WorldwayVoucher {
  documentType: "worldway-hotel-voucher";
  issuedAt: string;
  worldwayReference: string;
  ratehawkOrderId: string | number | null;
  status: RatehawkInternalStatus;
  hotel: { name: string | null; hotelId: string | null; hid: number | null };
  stay: { checkin: string; checkout: string; nights: number };
  room: { name: string | null; mealType: string | null };
  guests: { firstName: string; lastName: string }[];
  /** Customer-facing price only. The supplier net cost is retained for audit. */
  price: WorldwayCustomerPrice;
  cancellation: { freeCancellationBefore: string | null; policies: RatehawkCancellationPolicy[] };
}

function nights(checkin: string, checkout: string): number {
  const a = Date.parse(checkin);
  const b = Date.parse(checkout);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Issues the Worldway voucher. Returns null unless the booking is confirmed and
 * a customer price could be computed from real supplier figures.
 */
export function buildWorldwayVoucher(input: WorldwayVoucherInput): WorldwayVoucher | null {
  if (input.status !== "confirmed") return null;
  if (!input.price) return null;
  return {
    documentType: "worldway-hotel-voucher",
    issuedAt: new Date().toISOString(),
    worldwayReference: input.worldwayReference,
    ratehawkOrderId: input.ratehawkOrderId,
    status: input.status,
    hotel: { name: input.hotelName, hotelId: input.hotelId, hid: input.hid },
    stay: { checkin: input.checkin, checkout: input.checkout, nights: nights(input.checkin, input.checkout) },
    room: { name: input.roomName, mealType: input.mealType },
    guests: input.guests,
    price: input.price,
    cancellation: {
      freeCancellationBefore: input.freeCancellationBefore ?? null,
      policies: input.cancellationPolicies,
    },
  };
}
