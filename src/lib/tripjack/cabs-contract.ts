// TripJack Cabs API v2 — client-safe contract types.
// Field names are transcribed verbatim from the supplier documentation so no
// translation layer can drift from the wire format.
import type { CabJourneyType, CabTripType } from "./config";

export const TRIPJACK_CAB_PRODUCT_TYPE = "cab";
export const TRIPJACK_CAB_SUPPLIER = "TripJack Cabs";
export const TRIPJACK_INSURANCE_PRODUCT_TYPE = "insurance";
export const TRIPJACK_INSURANCE_SUPPLIER = "TripJack TripSafe";

/** Cabs v2 §3 Location Search API — one suggestion. */
export type CabPlace = {
  id: string;
  displayLabel: string;
  name: string;
  value: string;
  order?: number;
};

/** Cabs v2 §3 Get Lat Long API. */
export type CabLatLong = {
  location: { lat: number; lng: number };
  address: { city?: string; country?: string; postalCode?: string };
};

/** LocationDto used by the Quotes and Booking APIs. */
export type CabLocation = {
  type: "location";
  displayAddress: string;
  lat: string;
  long: string;
  address: {
    subLocality?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  };
};

/** Cabs v2 §3.1 QuoteRequest. */
export type CabQuoteRequest = {
  origin: CabLocation;
  destination: CabLocation;
  journeyType: CabJourneyType;
  tripType: CabTripType;
  /** yyyy-MM-dd HH:mm, at least 2 hours in the future. */
  pickupDate: string;
  /** yyyy-MM-dd HH:mm, required for roundtrip, at least 30 minutes after pickup. */
  returnDate?: string;
  passengers: number;
  durationInMinutes?: number;
  distanceInKm?: number;
  /** Present only for the documented embedded booking flow. */
  sourceBookingId?: string;
};

export type CabFareBreakup = {
  onwardFare?: number;
  backwardFare?: number;
  totalFare?: number;
  onwardTax?: number;
  backwardTax?: number;
  totalTax?: number;
};

export type CabCancellationRule = {
  minHours?: number;
  refundPercentage?: number;
  description?: string;
};

export type CabPolicies = {
  amendmentPolicy?: string;
  cancellationPolicy?: CabCancellationRule[];
  inclusions?: string[];
  exclusions?: string[];
  baggagePolicy?: string[];
  waitingTime?: string;
  termsAndPolicies?: string[];
  meetAndGreet?: string[];
};

/** CommonQuoteDto. */
export type CabQuote = {
  vendorId?: number;
  vehicleCategoryId?: number | string;
  vehicleTypeId?: number | string;
  quotationId?: string;
  quoteChildId?: string;
  fareBreakup?: CabFareBreakup;
  benefits?: string[];
  policies?: CabPolicies;
  sku?: string;
  paxCount?: number;
  luggageCount?: number;
  model?: string;
};

export type CabQuoteGroup = {
  vehicleType?: string;
  vehicleCategory?: string;
  label?: string;
  modelName?: string | null;
  paxCapacity?: string;
  luggageCapacity?: string;
  vehicleImages?: string[];
  similarType?: string;
  quotes?: CabQuote[];
};

export type CabJourneyInfo = {
  journeyType?: string;
  tripType?: string;
  pickupDateTime?: string;
  returnDateTime?: string;
  journeyLeg?: string;
  distance?: string;
  duration?: number;
  flightDetails?: { number?: string } | null;
};

export type CabRouteDetail = {
  isDomestic?: boolean;
  origin?: CabLocation;
  destination?: CabLocation;
};

export type CabQuoteResponseData = {
  journeyInfo?: CabJourneyInfo;
  routeDetails?: CabRouteDetail;
  quotesInfo?: CabQuoteGroup[];
};

/** Cabs v2 §3 Booking API request. */
export type CabBookingRequest = {
  journeyInfo: CabJourneyInfo;
  routeDetail: CabRouteDetail;
  addons: unknown[];
  quotationInfo: {
    vehicleType?: string;
    vehicleCategory?: string;
    quoteId?: string;
    childQuoteId?: string;
    paxCount?: number;
    luggageCount?: number;
    vendorId?: number;
  };
  pricingInfo: {
    netAmount: string;
    addonsPrice: string;
    agentMarkup: number;
    agentMarkupSplitup: { onwardJourneyMarkup: number; returnJourneyMarkup: number };
    grossAmount: string;
  };
  passengerDetail: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    flightDetails?: { number?: string };
  };
  serviceRequest?: string;
  consent: "yes";
  agentEmail?: string;
  agentPhone?: string;
  /** Present only in the documented embedded flow. */
  sourceBookingId?: string;
  productType?: "AIR";
};

/** Cabs v2 §3 Booking API response payload (`data`). */
export type CabBookingResponseData = {
  id: string;
  /** Booking user id — this is the documented `payUserId` for the Payment API. */
  agentId?: string;
  status?: string;
  paymentStatus?: string;
  totalPrice?: number;
  currency?: string;
  quoteId?: string;
  childQuoteId?: string;
  passengerCount?: number;
  luggageCount?: number;
  trackingLink?: string;
  rideStatus?: string;
  amendmentAllowed?: boolean;
  tripType?: string;
  journey?: Record<string, unknown>;
  bookingVehicle?: Record<string, unknown>;
  priceBreakup?: Record<string, unknown>;
};

/** Cabs v2 §3 Payment API request — every field is documented and mandatory. */
export type CabPaymentRequest = {
  amount: number;
  payUserId: string;
  paymentMedium: "WALLET";
  bookingId: string;
  opType: "DEBIT";
  product: "CAB";
  transactionType: "PAID_FOR_ORDER";
};

export function buildCabPaymentBody(input: {
  amount: number;
  payUserId: string;
  bookingId: string;
}): CabPaymentRequest {
  return {
    amount: input.amount,
    payUserId: input.payUserId,
    paymentMedium: "WALLET",
    bookingId: input.bookingId,
    opType: "DEBIT",
    product: "CAB",
    transactionType: "PAID_FOR_ORDER",
  };
}

/** Cabs v2 §3 Amendment Cancellation API request body. */
export type CabCancellationRequest = { bookingId: string; amendmentType: "CANCELLATION" };

export function buildCabCancellationBody(bookingId: string): CabCancellationRequest {
  return { bookingId, amendmentType: "CANCELLATION" };
}

/** Cabs v2 §3 Get Booking Details — `data[]` items carry `order` + `itemInfos`. */
export type CabBookingDetailsItem = {
  order?: {
    bookingId?: string;
    status?: string;
    paymentStatus?: string;
    amount?: number;
    taxes?: number;
    tripType?: string;
    rideStatus?: string;
    trackingLink?: string;
    paymentDate?: string;
    createdOn?: string;
    processedOn?: string;
    policies?: CabPolicies;
    helpline?: string;
    [key: string]: unknown;
  };
  itemInfos?: { CAB?: Record<string, unknown> };
  [key: string]: unknown;
};

export type CabBookingDetailsSummary = {
  bookingId: string;
  status?: string;
  paymentStatus?: string;
  amount?: number;
  rideStatus?: string;
  trackingLink?: string;
  tripType?: string;
  paymentDate?: string;
  policies?: CabPolicies;
};

/**
 * Normalises the documented Booking Details payload (`data: [{ order, … }]`).
 * Returns null when the supplier did not return the requested booking so the
 * caller can fail closed instead of assuming a status.
 */
export function parseCabBookingDetails(
  data: unknown,
  bookingId: string,
): CabBookingDetailsSummary | null {
  const list = Array.isArray(data) ? (data as CabBookingDetailsItem[]) : data ? [data as CabBookingDetailsItem] : [];
  const item = list.find((i) => i?.order?.bookingId === bookingId) ?? (list.length === 1 ? list[0] : undefined);
  const order = item?.order;
  if (!order || !order.bookingId) return null;
  return {
    bookingId: order.bookingId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    amount: typeof order.amount === "number" ? order.amount : undefined,
    rideStatus: order.rideStatus,
    trackingLink: order.trackingLink,
    tripType: order.tripType,
    paymentDate: order.paymentDate,
    policies: order.policies,
  };
}

/** Cabs v2 §3 Get Amendment Charges API response (`data.amendment`). */
export type CabAmendmentQuote = {
  bookingId?: string;
  amendType?: string;
  description?: string;
  tjAmendmentCharge?: number;
  tjManagementFee?: number;
  refundAmount?: number;
  amountPayable?: number;
  amountPaid?: number;
  appliedAmendmentConfig?: CabCancellationRule;
};

/** Cabs v2 §3 Amendment Cancellation API response (`data`). */
export type CabAmendmentResult = CabAmendmentQuote & {
  id?: string;
  amendStatus?: string;
  refundRefId?: string;
  processedOn?: string;
};

/** Standard TripJack success envelope. */
export type TripjackEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

/**
 * Maps a documented TripJack cab booking status onto the Worldway booking
 * lifecycle. Anything unrecognised stays "pending" — never optimistic.
 */
export function mapCabStatus(supplierStatus: string | undefined): string {
  switch ((supplierStatus ?? "").toUpperCase()) {
    case "CONFIRMED":
    case "SUCCESS":
    case "BOOKED":
    case "PAYMENT_SUCCESS":
      return "confirmed";
    case "PAYMENT_PENDING":
    case "PENDING":
    case "IN_PROGRESS":
      return "pending";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "FAILED":
    case "PAYMENT_FAILED":
      return "failed";
    default:
      return "pending";
  }
}
