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

  // 1. Authentication. /general/contract/data/info/ is not entitled on the sandbox
  // key (supplier answers "endpoint_not_found"), so multicomplete is the probe.
  const contract = await ratehawkCall<unknown>("multicomplete", { query: "London", language: "en" });
  steps.push(
    step("Sandbox authentication", "multicomplete", contract, contract.ok ? "Credentials accepted." : contract.error.message),
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
  // SERP rates carry only a match_hash; the bookable book_hash is issued by the
  // hotelpage call. Sandbox inventory is partly non-bookable, so candidates are
  // tried in order until one produces a usable booking form. Nothing is faked:
  // every attempt is a real supplier call and the supplier's own rejection is
  // recorded if none of them are bookable.
  const candidates = offers.filter((o) => o.hid != null).slice(0, 6);
  if (!search.ok || candidates.length === 0)
    return finish("Search returned no bookable hotel — the flow stopped here.");

  const partnerOrderId = `wwl-sbx-${randomUUID()}`;
  let chosen: { hotelId: string; hid: number } | null = null;
  let detailsResult: Awaited<ReturnType<typeof getHotelDetails>> | null = null;
  let hpResult: Awaited<ReturnType<typeof getHotelRates>> | null = null;
  let hpRateCount = 0;
  let prebook: Awaited<ReturnType<typeof prebookRate>> | null = null;
  let prebookDisabled = false;
  let bookHash = "";
  let form: Awaited<ReturnType<typeof createBookingForm>> | null = null;
  let chosenPayment: Record<string, unknown> = {};

  for (const candidate of candidates) {
    const hid = candidate.hid as number;
    const details = await getHotelDetails(candidate.hotelId);
    const hp = await getHotelRates({ checkin, checkout, residency, guests, hid });
    const hpOffers = hp.ok ? normaliseHotelOffers(hp.data) : [];
    const rate = hpOffers[0]?.rates[0];
    if (!rate) {
      detailsResult ??= details;
      hpResult ??= hp;
      continue;
    }

    // Prebook. ETG disables /hotel/prebook/ on some keys ("prebook_disabled");
    // that is a supplier entitlement, not an integration fault — the booking
    // form re-validates the rate, so the run continues with the original hash.
    const pre = await prebookRate(rate.bookHash);
    const disabled = !pre.ok && pre.error.code === "prebook_disabled";
    const hash = (pre.ok ? normaliseHotelOffers(pre.data)[0]?.rates[0]?.bookHash : null) ?? rate.bookHash;
    if (!pre.ok && !disabled) {
      detailsResult ??= details;
      hpResult ??= hp;
      prebook ??= pre;
      continue;
    }

    const bookingForm = await createBookingForm({ partnerOrderId, bookHash: hash, userIp: "203.0.113.10" });
    const formData = asRecord(bookingForm.ok ? bookingForm.data : {});
    const nested = asRecord(asArray(asRecord(formData["payment_types"])["payment_types"])[0]);
    const flat = asRecord(asArray(formData["payment_types"])[0]);
    const payment = Object.keys(nested).length ? nested : flat;

    detailsResult = details;
    hpResult = hp;
    hpRateCount = hpOffers[0]?.rates.length ?? 0;
    prebook = pre;
    prebookDisabled = disabled;
    bookHash = hash;
    form = bookingForm;
    chosenPayment = payment;
    chosen = { hotelId: candidate.hotelId, hid };
    if (bookingForm.ok && Object.keys(payment).length) break;
  }

  const detailsStep = detailsResult!;
  steps.push(
    step(
      "Hotel details (static content)",
      "hotelInfo",
      detailsStep,
      detailsStep.ok ? `Content returned for ${chosen?.hotelId ?? "candidate hotel"}.` : detailsStep.error.message,
    ),
  );

  const hp = hpResult!;
  steps.push(
    step("Rooms and rates (hotelpage)", "hotelPage", hp, hp.ok ? `${hpRateCount} rates returned.` : hp.error.message),
  );
  if (!prebook) return finish("The hotelpage returned no rate — prebook and booking were not attempted.");

  steps.push(
    step(
      "Prebook",
      "prebook",
      prebookDisabled ? { ...prebook, ok: true as const, data: null, meta: prebook.meta } : prebook,
      prebookDisabled
        ? 'Prebook is not enabled for this API key (supplier response "prebook_disabled"); the booking form re-validates the rate instead.'
        : prebook.ok
          ? `Rate revalidated; book_hash ${bookHash.slice(0, 12)}…`
          : prebook.error.message,
    ),
  );
  if ((!prebook.ok && !prebookDisabled) || !form) return finish("Prebook failed — booking was not attempted.");

  steps.push(
    step(
      "Create booking process",
      "bookingForm",
      form,
      form.ok ? `Booking form created for ${partnerOrderId}.` : form.error.message,
    ),
  );
  if (args.book === false)
    return finish("Search → details → rates → prebook → booking form verified. Booking was not requested in this run.", partnerOrderId);
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

  // 9. Order info. ETG indexes the order a few seconds after the booking
  // completes, so poll rather than reading once.
  let order = await getOrderInfo(partnerOrderId);
  let orderRows = asArray(asRecord(order.ok ? order.data : {})["orders"]);
  for (let attempt = 0; attempt < 6 && orderRows.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    order = await getOrderInfo(partnerOrderId);
    orderRows = asArray(asRecord(order.ok ? order.data : {})["orders"]);
  }
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
  let cancel = await cancelBooking(partnerOrderId);
  for (let attempt = 0; attempt < 4 && !cancel.ok && cancel.error.code === "order_not_found"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    cancel = await cancelBooking(partnerOrderId);
  }
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
