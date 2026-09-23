/**
 * Worldway activity voucher (pure, client-safe).
 *
 * A voucher is only ever issued for a booking the supplier has CONFIRMED and
 * for which a supplier booking reference exists. Pending, rejected, failed and
 * cancelled bookings never produce one.
 *
 * Viator flags potentially fraudulent transactions with
 * `voucherInfo.isVoucherRestrictionRequired`; when that is true the voucher must
 * not be delivered openly — it is released only behind an authenticated account
 * view (secure voucher redemption).
 */

import type { ActivityBookingState } from "@/lib/viator/checkout-contract";

export type VoucherInput = {
  state: ActivityBookingState | string;
  bookingReference: string | null;
  worldwayReference: string;
  itineraryReference?: string | null;
  productCode: string;
  productTitle: string;
  travelDate: string;
  startTime?: string | null;
  productOptionTitle?: string | null;
  travellers: { firstName: string; lastName: string; ageBand: string }[];
  paxMix: { ageBand: string; count: number }[];
  currency: string;
  total: number | null;
  cancellationPolicy: string | null;
  meetingPoint?: string | null;
  pickup?: string | null;
  languageGuide?: string | null;
  supplierVoucherUrl?: string | null;
  /** Viator fraud flag — true means the voucher must be delivered securely. */
  voucherRestrictionRequired?: boolean;
  customerEmail: string;
  customerPhone: string;
  issuedAt?: string;
};

export type ActivityVoucher = {
  documentType: "worldway-activity-voucher";
  status: "confirmed";
  worldwayReference: string;
  supplierReference: string;
  itineraryReference: string | null;
  issuedAt: string;
  experience: {
    productCode: string;
    title: string;
    option: string | null;
    travelDate: string;
    startTime: string | null;
    languageGuide: string | null;
    meetingPoint: string | null;
    pickup: string | null;
  };
  travellers: { travelerNum: number; name: string; ageBand: string }[];
  paxMix: { ageBand: string; count: number }[];
  price: { currency: string; total: number } | null;
  cancellationPolicy: string | null;
  delivery: {
    email: string;
    phone: string;
    /** true → show only inside the signed-in account, never in an open email link. */
    secureRedemptionRequired: boolean;
    supplierVoucherUrl: string | null;
  };
  terms: { termsUrl: string; privacyUrl: string };
};

export const VIATOR_TERMS_URL = "https://www.viator.com/support/termsAndConditions";
export const VIATOR_PRIVACY_URL = "https://tripadvisor.mediaroom.com/us-privacy-policy";

export type VoucherResult =
  | { issued: true; voucher: ActivityVoucher }
  | { issued: false; reason: string };

export function buildActivityVoucher(input: VoucherInput): VoucherResult {
  if (input.state !== "confirmed") {
    return { issued: false, reason: `No voucher is issued while the booking is ${input.state}.` };
  }
  const supplierReference = (input.bookingReference ?? "").trim();
  if (!supplierReference) {
    return { issued: false, reason: "No supplier booking reference — voucher withheld." };
  }

  return {
    issued: true,
    voucher: {
      documentType: "worldway-activity-voucher",
      status: "confirmed",
      worldwayReference: input.worldwayReference,
      supplierReference,
      itineraryReference: input.itineraryReference ?? null,
      issuedAt: input.issuedAt ?? new Date().toISOString(),
      experience: {
        productCode: input.productCode,
        title: input.productTitle,
        option: input.productOptionTitle ?? null,
        travelDate: input.travelDate,
        startTime: input.startTime ?? null,
        languageGuide: input.languageGuide ?? null,
        meetingPoint: input.meetingPoint ?? null,
        pickup: input.pickup ?? null,
      },
      travellers: input.travellers.map((t, i) => ({
        travelerNum: i + 1,
        name: `${t.firstName} ${t.lastName}`.trim(),
        ageBand: t.ageBand,
      })),
      paxMix: input.paxMix,
      price:
        input.total != null ? { currency: input.currency, total: input.total } : null,
      cancellationPolicy: input.cancellationPolicy,
      delivery: {
        email: input.customerEmail,
        phone: input.customerPhone,
        secureRedemptionRequired: input.voucherRestrictionRequired === true,
        supplierVoucherUrl: input.supplierVoucherUrl ?? null,
      },
      terms: { termsUrl: VIATOR_TERMS_URL, privacyUrl: VIATOR_PRIVACY_URL },
    },
  };
}
