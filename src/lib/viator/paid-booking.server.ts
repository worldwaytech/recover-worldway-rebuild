/**
 * Viator Affiliate Full + Booking — Worldway-collected payment (server only).
 *
 * On Affiliate Full + Booking accounts Viator books on Worldway's account and
 * rejects any payment submission mode, so the customer pays Worldway first
 * through the shared paid-booking engine (src/lib/up17/booking.server.ts,
 * travel_bookings):
 *
 *   live availability → cart/hold (no payment mode) → Worldway markup on the
 *   live retail price → live FX lock to INR → Razorpay or Worldway Wallet →
 *   ONE cart/book → CONFIRMED only on Viator's own CONFIRMED status.
 *
 * Timeouts/5xx on cart/book are resolved via /bookings/status; anything still
 * unclear is "uncertain" (money held, staff reconcile, never retried).
 */
import type { PaxMix } from "@/lib/viator/checkout-contract";
import type { BookingQuestionAnswer } from "@/lib/viator/booking-questions";

export type ActivityPayload = {
  kind: "activity";
  cartRef: string;
  viatorBookingRef: string;
  partnerBookingRef: string;
  productCode: string;
  productTitle: string;
  travelDate: string;
  startTime: string | null;
  productOptionCode: string | null;
  languageGuide: { type: string; language: string } | null;
  paxMix: PaxMix;
  booker: { firstName: string; lastName: string; email: string; phone: string };
  answers: BookingQuestionAnswer[];
  holdValidUntil: string | null;
  cancellationPolicy: string | null;
  meetingPoint: string | null;
  pricing: {
    supplierCurrency: string;
    retail: number;
    cost: number | null;
    markupPercent: number;
    customerSupplierCurrency: number;
    fx: { rate: number; provider: string; ratesAt: string | null; lockedAt: string };
    customerInr: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: customer price = live retail × (1 + approved markup). Exported for tests. */
export function activityCustomerPrice(input: {
  retail: number;
  cost: number | null;
  markupPercent: number | null;
}): { ok: true; price: number } | { ok: false; error: string } {
  if (!(input.retail > 0)) return { ok: false, error: "The live price could not be verified." };
  if (input.markupPercent === null || !(input.markupPercent >= 0)) {
    return { ok: false, error: "Online pricing for this experience is not configured yet." };
  }
  const price = round2(input.retail * (1 + input.markupPercent / 100));
  // Never sell below what Worldway pays for the booking.
  if (input.cost !== null && price < input.cost) {
    return { ok: false, error: "The live price could not be verified." };
  }
  return { ok: true, price };
}

/** Pure: guide language is mandatory whenever the product/option lists guides. */
export function resolveGuideLanguage(
  choices: { type: string; language: string }[],
  chosen: { type: string; language: string } | undefined | null,
): { ok: true; guide: { type: string; language: string } | null } | { ok: false; error: string } {
  if (!choices.length) return { ok: true, guide: chosen ?? null };
  if (!chosen) return { ok: false, error: "Choose a guide language for this experience." };
  const match = choices.find((c) => c.type === chosen.type && c.language === chosen.language);
  if (!match) return { ok: false, error: "That guide language is not offered for this experience." };
  return { ok: true, guide: { type: match.type, language: match.language } };
}

/** Pure: AGEBAND answers derived from the pax mix (traveller order = pax order). */
export function ageBandAnswers(paxMix: PaxMix): BookingQuestionAnswer[] {
  const out: BookingQuestionAnswer[] = [];
  let n = 1;
  for (const p of paxMix) {
    for (let i = 0; i < p.count; i += 1) out.push({ question: "AGEBAND", answer: p.ageBand, travelerNum: n++ });
  }
  return out;
}

export type PrepareActivityInput = {
  productCode: string;
  productTitle?: string;
  travelDate: string;
  currency: string;
  paxMix: PaxMix;
  productOptionCode?: string;
  startTime?: string;
  languageGuide?: { type: string; language: string };
  booker: { firstName: string; lastName: string; email: string; phone?: string };
  travellers: { firstName: string; lastName: string }[];
  bookingQuestionAnswers: BookingQuestionAnswer[];
};

export async function prepareViatorPaidBooking(userId: string, input: PrepareActivityInput) {
  const { validateHoldInput, validateBooker } = await import("./checkout-contract");
  const { travellerNameAnswers, validateBookingQuestionAnswers } = await import("./booking-questions");
  const { validatePaxMixAgainstBands } = await import("./age-bands");
  const { viatorProductFull, viatorProductBookingQuestions } = await import("@/lib/viator.server");
  const { viatorCheckAvailability, viatorCartHold } = await import("./booking.server");

  let hold;
  let booker;
  try {
    hold = validateHoldInput({
      productCode: input.productCode,
      travelDate: input.travelDate,
      currency: input.currency,
      paxMix: input.paxMix,
      ...(input.productOptionCode ? { productOptionCode: input.productOptionCode } : {}),
      ...(input.startTime ? { startTime: input.startTime } : {}),
    });
    booker = validateBooker(input.booker);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Check your booking details." };
  }
  if (!booker.phone) return { ok: false as const, error: "A contact phone number is required." };

  const productRes = await viatorProductFull(hold.productCode, hold.currency);
  const product = productRes.ok ? productRes.product : null;
  if (!product) return { ok: false as const, error: "This experience could not be loaded. Please try again." };

  const paxCheck = validatePaxMixAgainstBands(hold.paxMix, product.ageBands, {
    minTravelersPerBooking: product.bookingLimits.minTravelersPerBooking,
    maxTravelersPerBooking: product.bookingLimits.maxTravelersPerBooking,
  });
  if (!paxCheck.ok) return { ok: false as const, error: paxCheck.reason };

  const option = product.productOptions.find((o) => o.code === hold.productOptionCode);
  if (product.productOptions.length > 1 && !option) {
    return { ok: false as const, error: "Choose which option of this experience you want." };
  }
  const guide = resolveGuideLanguage(
    option?.languageGuides.length ? option.languageGuides : product.languageGuides,
    input.languageGuide,
  );
  if (!guide.ok) return { ok: false as const, error: guide.error };

  const travellerCount = hold.paxMix.reduce((s, p) => s + p.count, 0);
  const questions = await viatorProductBookingQuestions(product.bookingQuestionIds);
  const supplied: BookingQuestionAnswer[] = [
    ...ageBandAnswers(hold.paxMix),
    ...travellerNameAnswers(
      Array.from({ length: travellerCount }, (_, i) => ({
        firstName: input.travellers[i]?.firstName || (i === 0 ? booker.firstName : ""),
        lastName: input.travellers[i]?.lastName || (i === 0 ? booker.lastName : ""),
      })),
    ),
    ...input.bookingQuestionAnswers.filter((a) => a.question !== "AGEBAND"),
  ];
  const validated = questions.length
    ? validateBookingQuestionAnswers(questions, supplied, travellerCount)
    : ({ ok: true, answers: supplied } as const);
  if (!validated.ok) return { ok: false as const, error: validated.reason };

  const availability = await viatorCheckAvailability(hold);
  if (!availability.ok || !availability.available) {
    return { ok: false as const, error: "This experience is not available for the selected date and party." };
  }
  const resolved = {
    ...hold,
    ...(availability.productOptionCode ? { productOptionCode: availability.productOptionCode } : {}),
    ...(availability.startTime ? { startTime: availability.startTime } : {}),
    ...(guide.guide ? { languageGuide: guide.guide } : {}),
  };

  const partnerCartRef = `WW-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  const partnerBookingRef = `${partnerCartRef}-1`;
  const held = await viatorCartHold({
    hold: resolved,
    partnerCartRef,
    partnerBookingRef,
    booker,
    paymentSubmission: "NONE",
  });
  const item = held.items.find((i) => i.bookingRef && i.status.toUpperCase() !== "REJECTED");
  if (!held.ok || !item?.bookingRef) {
    return { ok: false as const, error: held.error ?? "This experience could not be held. Please try another date." };
  }

  const { commercialRuleFor } = await import("@/lib/engine/suppliers/commercial.server");
  const rule = commercialRuleFor({ supplierKey: "viator-affiliate" });
  const retail = held.total ?? availability.total ?? 0;
  const priced = activityCustomerPrice({ retail, cost: held.cost, markupPercent: rule?.markupPercent ?? null });
  if (!priced.ok) return { ok: false as const, error: priced.error };

  const currency = held.currency.toUpperCase();
  const { approvedFx } = await import("@/lib/engine/suppliers/fx.server");
  const fx = await approvedFx("INR", [currency]);
  const rate = currency === "INR" ? 1 : fx.table[currency];
  if (currency !== "INR" && (!fx.source || !(rate! > 0))) {
    return { ok: false as const, error: "Live exchange rates are unavailable right now. Please try again in a few minutes." };
  }
  const customerInr = round2(priced.price * rate!);

  const payload: ActivityPayload = {
    kind: "activity",
    cartRef: held.cartRef,
    viatorBookingRef: item.bookingRef,
    partnerBookingRef,
    productCode: hold.productCode,
    productTitle: (input.productTitle ?? product.title ?? hold.productCode).slice(0, 300),
    travelDate: hold.travelDate,
    startTime: resolved.startTime ?? null,
    productOptionCode: resolved.productOptionCode ?? null,
    languageGuide: guide.guide,
    paxMix: hold.paxMix,
    booker: { ...booker, phone: booker.phone },
    answers: validated.answers,
    holdValidUntil: held.holdExpiresAt,
    cancellationPolicy: product.cancellationPolicy?.description ?? null,
    meetingPoint: product.meetingPoint ?? null,
    pricing: {
      supplierCurrency: currency,
      retail,
      cost: held.cost,
      markupPercent: rule!.markupPercent,
      customerSupplierCurrency: priced.price,
      fx: { rate: rate!, provider: fx.source ?? "identity", ratesAt: fx.audit.ratesAt, lockedAt: new Date().toISOString() },
      customerInr,
    },
  };

  const { createIntent } = await import("@/lib/up17/booking.server");
  const intent = await createIntent({
    userId,
    product: "activity",
    amount: customerInr,
    currency: "INR",
    summary: {
      title: payload.productTitle,
      departure: payload.travelDate,
      startTime: payload.startTime,
      lead: `${booker.firstName} ${booker.lastName}`,
      guests: travellerCount,
      guideLanguage: guide.guide ? guide.guide.language.toUpperCase() : null,
      exchangeRate: currency === "INR" ? null : `1 ${currency} = ₹${rate!.toFixed(4)}`,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: payload as any,
  });
  const { razorpayLimitMinor } = await import("@/lib/crystal/deposit.server");
  return {
    ok: true as const,
    ...intent,
    holdValidUntil: held.holdExpiresAt,
    fx: currency === "INR" ? null : { sourceCurrency: currency, sourceAmount: priced.price, rate: rate! },
    cardAllowed: intent.amountMinor <= razorpayLimitMinor(),
  };
}

type SupplierResult = {
  ok: boolean;
  status: number;
  error?: string;
  data?: { bookingId: string | null; confirmationNo: string | null; status: string | null; confirmed: boolean; raw: unknown };
};

/** Exactly one cart/book for a paid activity intent. */
export async function bookViatorActivity(p: ActivityPayload): Promise<SupplierResult> {
  const { viatorCartBook, viatorBookingStatus } = await import("./booking.server");
  const { mapViatorBookingStatus } = await import("./checkout-contract");
  const res = await viatorCartBook({
    cartRef: p.cartRef,
    booker: p.booker,
    items: [
      {
        bookingRef: p.viatorBookingRef,
        ...(p.languageGuide ? { languageGuide: p.languageGuide } : {}),
        bookingQuestionAnswers: p.answers,
      },
    ],
  });

  let statuses = res.statuses;
  let voucherInfo = res.voucherInfo;
  if (!res.ok) {
    if (!res.indeterminate) return { ok: false, status: 400, error: res.error ?? "refused" };
    const st = await viatorBookingStatus({ partnerBookingRef: p.partnerBookingRef });
    if (!st.ok || !st.statuses.length) return { ok: false, status: 504, error: res.error ?? "supplier timeout" };
    statuses = st.statuses;
    voucherInfo = st.voucherInfo;
  }
  const state = mapViatorBookingStatus(statuses);
  if (state === "failed" || state === "rejected") {
    return { ok: false, status: 400, error: `supplier status ${statuses.join(",")}` };
  }
  return {
    ok: true,
    status: 200,
    data: {
      bookingId: res.bookingRef ?? p.viatorBookingRef,
      confirmationNo: res.bookingRef ?? p.viatorBookingRef,
      status: statuses.join(",") || null,
      // Pending supplier confirmation stays "uncertain" (staff follow-up), never shown as confirmed.
      confirmed: state === "confirmed",
      raw: { statuses, itineraryRef: res.itineraryRef, voucherInfo },
    },
  };
}

/** Worldway-branded voucher fields stored on the customer's booking (no supplier identity). */
export function activityVoucherSummary(p: ActivityPayload) {
  const names: Record<number, { f?: string; l?: string }> = {};
  for (const a of p.answers) {
    const n = a.travelerNum ?? 1;
    if (a.question === "FULL_NAMES_FIRST") names[n] = { ...names[n], f: a.answer };
    if (a.question === "FULL_NAMES_LAST") names[n] = { ...names[n], l: a.answer };
  }
  return {
    voucherStatus: "Confirmed",
    travellers: Object.keys(names)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => `${names[n]?.f ?? ""} ${names[n]?.l ?? ""}`.trim()),
    meetingPoint: p.meetingPoint,
    cancellationPolicy: p.cancellationPolicy,
  };
}
