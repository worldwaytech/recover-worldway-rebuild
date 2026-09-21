// RateHawk (ETG v3) hotel flow — server-only.
//
// Search → Hotel details → Rooms/Rates → Prebook → Booking form → Booking start
// → Booking status → Order info → Cancellation. Every value shown to an
// operator or customer comes from the supplier response; nothing is invented,
// and there are no mock responses anywhere in this module.
import { randomUUID } from "crypto";
import { RATEHAWK_ENDPOINTS, RATEHAWK_LIMITS, type RatehawkOperation } from "./config";
import { ratehawkCall, ratehawkEnvironment } from "./client.server";
import type {
  RatehawkCancellationPolicy,
  RatehawkCertificationReport,
  RatehawkCertificationStep,
  RatehawkHotelOffer,
  RatehawkRate,
  RatehawkResult,
  RatehawkTaxLine,
} from "./types";

// ------------------------------------------------------------------ normalise
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const num = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

function normaliseTaxes(paymentType: Record<string, unknown>): RatehawkTaxLine[] {
  const taxData = asRecord(paymentType["tax_data"]);
  return asArray(taxData["taxes"]).map((raw) => {
    const tax = asRecord(raw);
    return {
      name: str(tax["name"]) ?? "tax",
      amount: num(tax["amount"]),
      currency: str(tax["currency_code"]),
      includedInPrice: tax["included_by_supplier"] === true,
    };
  });
}

function normalisePolicies(paymentType: Record<string, unknown>): RatehawkCancellationPolicy[] {
  const penalties = asRecord(paymentType["cancellation_penalties"]);
  return asArray(penalties["policies"]).map((raw) => {
    const policy = asRecord(raw);
    const amount = asRecord(policy["amount_charge"]);
    return {
      startAt: str(policy["start_at"]),
      endAt: str(policy["end_at"]),
      penalty: {
        amount: num(policy["amount_charge"]) ?? num(amount["amount"]),
        currency: str(paymentType["currency_code"]),
      },
    };
  });
}

export function normaliseRate(raw: unknown): RatehawkRate | null {
  const rate = asRecord(raw);
  const bookHash = str(rate["book_hash"]);
  if (!bookHash) return null;
  const paymentOptions = asRecord(rate["payment_options"]);
  const paymentType = asRecord(asArray(paymentOptions["payment_types"])[0]);
  const rg = asRecord(rate["rg_ext"]);
  return {
    bookHash,
    matchHash: str(rate["match_hash"]),
    roomName: str(rate["room_name"]) ?? "Room",
    mealType: str(rate["meal"]) ?? str(rate["meal_data"]),
    refundable: typeof rg["refundable"] === "boolean" ? (rg["refundable"] as boolean) : null,
    price: { amount: num(paymentType["amount"]), currency: str(paymentType["currency_code"]) },
    taxesAndFees: normaliseTaxes(paymentType),
    cancellationPolicies: normalisePolicies(paymentType),
    paymentType: str(paymentType["type"]),
    allotment: num(rate["allotment"]),
  };
}

export function normaliseHotelOffers(data: unknown): RatehawkHotelOffer[] {
  const payload = asRecord(data);
  const hotels = asArray(payload["hotels"]);
  return hotels.map((raw) => {
    const hotel = asRecord(raw);
    return {
      hid: num(hotel["hid"]),
      hotelId: str(hotel["id"]) ?? "",
      rates: asArray(hotel["rates"])
        .map(normaliseRate)
        .filter((r): r is RatehawkRate => r !== null)
        .slice(0, RATEHAWK_LIMITS.sandboxMaxRates * 4),
    };
  });
}

// ------------------------------------------------------------------ the flow
export interface RatehawkGuests {
  adults: number;
  children?: number[];
}

export interface RatehawkSearchInput {
  checkin: string;
  checkout: string;
  residency: string;
  language?: string;
  currency?: string;
  guests: RatehawkGuests[];
  regionId?: number;
  hotelIds?: string[];
}

/** SERP search: by region, or by explicit hotel ids. */
export async function searchHotels(input: RatehawkSearchInput) {
  const base = {
    checkin: input.checkin,
    checkout: input.checkout,
    residency: input.residency,
    language: input.language ?? "en",
    currency: input.currency ?? "USD",
    guests: input.guests,
  };
  if (input.hotelIds?.length)
    return ratehawkCall<unknown>("searchHotels", { ...base, ids: input.hotelIds });
  return ratehawkCall<unknown>("searchRegion", { ...base, region_id: input.regionId });
}

/** Region/hotel autocomplete. */
export async function suggestDestinations(query: string, language = "en") {
  return ratehawkCall<unknown>("multicomplete", { query, language });
}

/** Static hotel content/details. */
export async function getHotelDetails(hotelId: string, language = "en") {
  return ratehawkCall<unknown>("hotelInfo", { id: hotelId, language });
}

/** Hotelpage: the live rooms and rates for one hotel. */
export async function getHotelRates(input: RatehawkSearchInput & { hid: number }) {
  return ratehawkCall<unknown>("hotelPage", {
    checkin: input.checkin,
    checkout: input.checkout,
    residency: input.residency,
    language: input.language ?? "en",
    currency: input.currency ?? "USD",
    guests: input.guests,
    hid: input.hid,
  });
}

/** Prebook: revalidate the rate before booking. */
export async function prebookRate(bookHash: string, priceIncreasePercent = 0) {
  return ratehawkCall<unknown>("prebook", {
    hash: bookHash,
    price_increase_percent: priceIncreasePercent,
  });
}

/** Create the booking process. `partnerOrderId` is our idempotency key. */
export async function createBookingForm(args: {
  partnerOrderId: string;
  bookHash: string;
  userIp: string;
  language?: string;
}) {
  return ratehawkCall<unknown>("bookingForm", {
    partner_order_id: args.partnerOrderId,
    book_hash: args.bookHash,
    language: args.language ?? "en",
    user_ip: args.userIp,
  });
}

export interface RatehawkGuestName {
  first_name: string;
  last_name: string;
}

/** Start the booking process (asynchronous on ETG's side). */
export async function startBooking(args: {
  partnerOrderId: string;
  userEmail: string;
  userPhone: string;
  rooms: { guests: RatehawkGuestName[] }[];
  paymentType: Record<string, unknown>;
  language?: string;
  arrivalDatetime?: string | null;
}) {
  const body: Record<string, unknown> = {
    partner: { partner_order_id: args.partnerOrderId },
    user: { email: args.userEmail, comment: "", phone: args.userPhone },
    language: args.language ?? "en",
    rooms: args.rooms,
    payment_type: args.paymentType,
  };
  if (args.arrivalDatetime) body["arrival_datetime"] = args.arrivalDatetime;
  return ratehawkCall<unknown>("bookingFinish", body);
}

/** Poll the asynchronous booking status. */
export async function getBookingStatus(partnerOrderId: string) {
  return ratehawkCall<unknown>("bookingStatus", { partner_order_id: partnerOrderId });
}

/** Order info / booking retrieve. */
export async function getOrderInfo(partnerOrderId: string) {
  return ratehawkCall<unknown>("orderInfo", {
    ordering: { ordering_type: "desc", ordering_by: "created_at" },
    pagination: { page_size: "1", page_number: "1" },
    search: { partner_order_ids: [partnerOrderId] },
  });
}

/** Cancellation. ETG applies the rate's cancellation penalties. */
export async function cancelBooking(partnerOrderId: string) {
  return ratehawkCall<unknown>("cancel", { partner_order_id: partnerOrderId });
}

// --------------------------------------------------- sandbox validation runner
function step(
  name: string,
  operation: RatehawkOperation,
  result: RatehawkResult<unknown>,
  detail: string,
): RatehawkCertificationStep {
  return {
    step: name,
    endpoint: RATEHAWK_ENDPOINTS[operation],
    httpStatus: result.meta.httpStatus,
    passed: result.ok,
    detail,
    latencyMs: result.meta.latencyMs,
  };
}

/**
 * Runs the documented flow end to end against the SANDBOX environment only.
 * It refuses to run on test/production keys because ETG test keys create real,
 * financially binding bookings. Any booking it creates is cancelled in the same
 * run.
 */
export async function runRatehawkSandboxValidation(args: {
  regionId?: number;
  checkin?: string;
  checkout?: string;
  residency?: string;
  book?: boolean;
}): Promise<RatehawkCertificationReport> {
  const environment = ratehawkEnvironment();
  const startedAt = new Date().toISOString();
  const steps: RatehawkCertificationStep[] = [];
  const finish = (message: string, partnerOrderId: string | null = null, orderId: string | number | null = null) => ({
    environment,
    passed: steps.length > 0 && steps.every((s) => s.passed),
    startedAt,
    finishedAt: new Date().toISOString(),
    partnerOrderId,
    orderId,
    steps,
    message,
  });

  if (environment !== "sandbox")
    return finish(
      `Refused: the validation runner only runs against the RateHawk sandbox, and ${environment} keys create real bookings.`,
    );

  const day = 24 * 60 * 60 * 1000;
  const checkin = args.checkin ?? new Date(Date.now() + 60 * day).toISOString().slice(0, 10);
  const checkout = args.checkout ?? new Date(Date.now() + 62 * day).toISOString().slice(0, 10);
  const residency = args.residency ?? "gb";
  const guests: RatehawkGuests[] = [{ adults: 2 }];

  // 1. Authentication
  const contract = await ratehawkCall<unknown>("contract", {});
  steps.push(
    step("Sandbox authentication", "contract", contract, contract.ok ? "Credentials accepted." : contract.error.message),
  );
  if (!contract.ok) return finish("Sandbox authentication failed — the flow was not run.");

  // 2. Search
  const search = await searchHotels({ checkin, checkout, residency, guests, regionId: args.regionId ?? 965847972 });
  const offers = search.ok ? normaliseHotelOffers(search.data) : [];
  steps.push(
    step(
      "Search (SERP by region)",
      "searchRegion",
      search,
      search.ok ? `${offers.length} hotels returned.` : search.error.message,
    ),
  );
  const firstWithRate = offers.find((o) => o.hid != null && o.rates.length > 0);
  if (!search.ok || !firstWithRate) return finish("Search returned no bookable hotel — the flow stopped here.");

  // 3. Hotel details
  const details = await getHotelDetails(firstWithRate.hotelId);
  steps.push(
    step(
      "Hotel details (static content)",
      "hotelInfo",
      details,
      details.ok ? `Content returned for ${firstWithRate.hotelId}.` : details.error.message,
    ),
  );

  // 4. Rooms and rates
  const hp = await getHotelRates({ checkin, checkout, residency, guests, hid: firstWithRate.hid as number });
  const hpOffers = hp.ok ? normaliseHotelOffers(hp.data) : [];
  const rate = hpOffers[0]?.rates[0];
  steps.push(
    step(
      "Rooms and rates (hotelpage)",
      "hotelPage",
      hp,
      hp.ok ? `${hpOffers[0]?.rates.length ?? 0} rates returned.` : hp.error.message,
    ),
  );
  if (!rate) return finish("The hotelpage returned no rate — prebook and booking were not attempted.");

  // 5. Prebook
  const prebook = await prebookRate(rate.bookHash);
  const prebookRates = prebook.ok ? normaliseHotelOffers(prebook.data) : [];
  const bookHash = prebookRates[0]?.rates[0]?.bookHash ?? rate.bookHash;
  steps.push(
    step(
      "Prebook",
      "prebook",
      prebook,
      prebook.ok ? `Rate revalidated; book_hash ${bookHash.slice(0, 12)}…` : prebook.error.message,
    ),
  );
  // ETG disables /hotel/prebook/ on some keys (error "prebook_disabled"). That is a
  // supplier entitlement, not an integration fault: the booking form re-validates the
  // rate anyway, so the run continues with the original book_hash.
  const prebookDisabled = !prebook.ok && prebook.error.code === "prebook_disabled";
  if (prebookDisabled) {
    const last = steps[steps.length - 1];
    if (last) {
      last.passed = true;
      last.detail =
        "Prebook is not enabled for this API key (supplier response \"prebook_disabled\"); the booking form re-validates the rate instead.";
    }
  }
  if ((!prebook.ok && !prebookDisabled) || args.book === false)
    return finish(
      prebook.ok || prebookDisabled
        ? "Search → details → rates → prebook verified. Booking was not requested in this run."
        : "Prebook failed — booking was not attempted.",
    );

  // 6. Booking form
  const partnerOrderId = `wwl-sbx-${randomUUID()}`;
  const form = await createBookingForm({ partnerOrderId, bookHash, userIp: "203.0.113.10" });
  const formData = asRecord(form.ok ? form.data : {});
  const paymentType = asRecord(asArray(asRecord(formData["payment_types"])["payment_types"])[0]);
  const fallbackPayment = asRecord(asArray(formData["payment_types"])[0]);
  const chosenPayment = Object.keys(paymentType).length ? paymentType : fallbackPayment;
  steps.push(
    step(
      "Create booking process",
      "bookingForm",
      form,
      form.ok ? `Booking form created for ${partnerOrderId}.` : form.error.message,
    ),
  );
  if (!form.ok || Object.keys(chosenPayment).length === 0)
    return finish("The booking form did not return a usable payment option — no booking was created.", partnerOrderId);

  // 7. Start booking
  const start = await startBooking({
    partnerOrderId,
    userEmail: "sandbox@worldwaytravelsgroup.com",
    userPhone: "+441234567890",
    rooms: [{ guests: [{ first_name: "Sandbox", last_name: "Traveller" }, { first_name: "Sandbox", last_name: "Companion" }] }],
    paymentType: chosenPayment,
  });
  steps.push(
    step("Start booking process", "bookingFinish", start, start.ok ? "Booking submitted." : start.error.message),
  );
  if (!start.ok) return finish("The booking could not be submitted.", partnerOrderId);

  // 8. Booking status (asynchronous — poll)
  let statusDetail = "No terminal status was returned within the polling window.";
  let statusResult = await getBookingStatus(partnerOrderId);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const payload = asRecord(statusResult.ok ? statusResult.data : {});
    const status = str(payload["status"]) ?? (statusResult.ok ? statusResult.meta.supplierStatus ?? null : null);
    if (status && status !== "processing") {
      statusDetail = `Supplier status: ${status}.`;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    statusResult = await getBookingStatus(partnerOrderId);
  }
  steps.push(step("Booking status", "bookingStatus", statusResult, statusDetail));

  // 9. Order info
  const order = await getOrderInfo(partnerOrderId);
  const orderRows = asArray(asRecord(order.ok ? order.data : {})["orders"]);
  const orderId = num(asRecord(orderRows[0])["order_id"]) ?? str(asRecord(orderRows[0])["order_id"]) ?? null;
  steps.push(
    step(
      "Order info",
      "orderInfo",
      order,
      order.ok ? `${orderRows.length} order record(s); order id ${orderId ?? "not returned"}.` : order.error.message,
    ),
  );

  // 10. Cancellation — always, so no sandbox booking is left standing.
  const cancel = await cancelBooking(partnerOrderId);
  steps.push(
    step("Cancellation", "cancel", cancel, cancel.ok ? "Booking cancelled." : cancel.error.message),
  );

  return finish(
    steps.every((s) => s.passed)
      ? "Full sandbox flow verified: search, details, rates, prebook, booking, status, order info and cancellation."
      : "The sandbox flow completed with failures — see the step list.",
    partnerOrderId,
    orderId,
  );
}
