/**
 * Merchant sandbox server functions. Public functions are read-only catalogue
 * calls; every booking-lifecycle function requires a signed-in customer and
 * scopes records to that customer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  merchantAvailability,
  merchantProduct,
  merchantSearch,
} from "@/lib/viator-merchant/catalogue.server";
import {
  merchantBookingStatus,
  merchantCancelBooking,
  merchantCancelQuote,
  merchantCartBook,
  merchantCartHold,
  type MerchantBooker,
} from "@/lib/viator-merchant/booking.server";
import {
  claimMerchantHold,
  getMerchantBooking,
  insertMerchantHold,
  listAllMerchantBookings,
  listMerchantBookingsForUser,
  releaseMerchantClaim,
  updateMerchantBooking,
} from "@/lib/viator-merchant/bookings.server";
import {
  isHoldUsable,
  validateBooker,
} from "@/lib/viator/checkout-contract";
import { CANONICAL_HOSTING_ORIGIN } from "@/lib/viator/checkout-contract";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const paxMixSchema = z
  .array(
    z.object({
      ageBand: z.enum(["ADULT", "CHILD", "INFANT", "SENIOR", "YOUTH"]),
      count: z.number().int().min(0).max(30),
    }),
  )
  .min(1)
  .max(5);

function validatePax(paxMix: { ageBand: string; count: number }[]): void {
  const total = paxMix.filter((p) => p.count > 0).reduce((s, p) => s + p.count, 0);
  if (total < 1) throw new Error("At least one traveller is required.");
  if (total > 30) throw new Error("Maximum 30 travellers per booking.");
  if (!paxMix.some((p) => (p.ageBand === "ADULT" || p.ageBand === "SENIOR") && p.count > 0)) {
    throw new Error("At least one adult traveller is required.");
  }
}

// ------------------------------------------------------------ public reads

export const searchMerchantExperiences = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(data),
  )
  .handler(async ({ data }) => merchantSearch({ query: data.query }));

export const getMerchantProduct = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{3,40}$/) }).parse(data),
  )
  .handler(async ({ data }) => merchantProduct(data.code));

export const getMerchantAvailability = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        productCode: z.string().regex(/^[A-Za-z0-9_-]{3,40}$/),
        travelDate: z.string().regex(DATE_RE),
        paxMix: paxMixSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    validatePax(data.paxMix);
    return merchantAvailability({
      productCode: data.productCode,
      travelDate: data.travelDate,
      paxMix: data.paxMix,
    });
  });

// ------------------------------------------------------------ booking (auth)

const bookerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(8).max(20),
});

export const holdMerchantExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        productCode: z.string().regex(/^[A-Za-z0-9_-]{3,40}$/),
        productTitle: z.string().trim().max(200).optional(),
        productOptionCode: z.string().trim().min(1).max(60),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        travelDate: z.string().regex(DATE_RE),
        paxMix: paxMixSchema,
        languageGuide: z
          .object({ type: z.string().max(20), language: z.string().max(10) })
          .optional(),
        booker: bookerSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    validatePax(data.paxMix);
    let booker: MerchantBooker;
    try {
      booker = validateBooker(data.booker);
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Invalid booker." };
    }
    // Re-check availability server-side so the held price is the supplier's,
    // never a browser-supplied number.
    const avail = await merchantAvailability({
      productCode: data.productCode,
      travelDate: data.travelDate,
      paxMix: data.paxMix,
    });
    const slot = avail.slots.find(
      (s) =>
        s.productOptionCode === data.productOptionCode &&
        (data.startTime ? s.startTime === data.startTime : true) &&
        s.available,
    );
    if (!avail.ok || !slot) {
      return {
        ok: false as const,
        error: avail.error ?? "This option is no longer available for the selected date.",
      };
    }

    const partnerBookingRef = `WWT-MERCH-${Date.now()}`;
    const partnerCartRef = `CART-${partnerBookingRef}`;
    const hold = await merchantCartHold({
      hold: {
        productCode: data.productCode,
        productOptionCode: data.productOptionCode,
        ...(data.startTime ? { startTime: data.startTime } : {}),
        travelDate: data.travelDate,
        currency: slot.currency,
        paxMix: data.paxMix,
        ...(data.languageGuide ? { languageGuide: data.languageGuide } : {}),
      },
      partnerCartRef,
      partnerBookingRef,
      booker,
      hostingUrl: CANONICAL_HOSTING_ORIGIN,
    });
    if (!hold.ok) {
      return { ok: false as const, ...(hold.error ? { error: hold.error } : {}) };
    }
    const insert = await insertMerchantHold({
      user_id: context.userId,
      partner_booking_ref: partnerBookingRef,
      partner_cart_ref: partnerCartRef,
      cart_ref: hold.cartRef,
      booking_ref: hold.bookingRef,
      product_code: data.productCode,
      product_title: data.productTitle ?? null,
      option_code: data.productOptionCode,
      start_time: data.startTime ?? null,
      travel_date: data.travelDate,
      language_guide: data.languageGuide ? data.languageGuide.language : null,
      traveller_count: data.paxMix.reduce((s, p) => s + p.count, 0),
      retail_price: hold.retailTotal ?? slot.retailTotal,
      currency: hold.currency,
      booker,
      audit: { holdExpiresAt: hold.holdExpiresAt, environment: "sandbox" },
    });
    if (insert.error) return { ok: false as const, error: insert.error };
    return {
      ok: true as const,
      partnerBookingRef,
      currency: hold.currency,
      retailTotal: hold.retailTotal ?? slot.retailTotal,
      holdExpiresAt: hold.holdExpiresAt,
    };
  });

export const bookMerchantExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        partnerBookingRef: z.string().regex(/^WWT-MERCH-\d+$/),
        languageGuide: z
          .object({ type: z.string().max(20), language: z.string().max(10) })
          .optional(),
        bookingQuestionAnswers: z
          .array(
            z.object({
              question: z.string().max(60),
              answer: z.string().max(500),
              travelerNum: z.number().int().min(1).max(30).optional(),
            }),
          )
          .max(20)
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const record = await getMerchantBooking(data.partnerBookingRef);
    if (!record || record.user_id !== context.userId) {
      return { ok: false as const, error: "Booking not found." };
    }
    if (record.status === "confirmed") {
      return { ok: true as const, partnerBookingRef: record.partner_booking_ref, state: "confirmed" as const, alreadyConfirmed: true };
    }
    if (record.status === "cancelled" || record.status === "rejected" || record.status === "failed") {
      return { ok: false as const, error: "This booking can no longer be submitted." };
    }
    const audit = (record as { audit?: { holdExpiresAt?: string | null } }).audit;
    const holdExpiresAt = audit?.holdExpiresAt ?? null;
    if (!isHoldUsable(holdExpiresAt)) {
      return { ok: false as const, error: "The availability hold expired — please search again." };
    }
    const claimed = await claimMerchantHold(data.partnerBookingRef, context.userId);
    if (!claimed) {
      return { ok: false as const, error: "This booking is already being processed." };
    }
    if (!claimed.cart_ref || !claimed.booking_ref) {
      await releaseMerchantClaim(data.partnerBookingRef, "Missing supplier cart reference.");
      return { ok: false as const, error: "The reservation is incomplete — please search again." };
    }

    const booker = record.booker as MerchantBooker;
    const result = await merchantCartBook({
      cartRef: claimed.cart_ref,
      booker,
      items: [
        {
          bookingRef: claimed.booking_ref,
          ...(data.languageGuide ? { languageGuide: data.languageGuide } : {}),
          ...(data.bookingQuestionAnswers
            ? { bookingQuestionAnswers: data.bookingQuestionAnswers }
            : {}),
        },
      ],
    });

    if (!result.ok) {
      if (result.indeterminate) {
        // Never retry blindly — ask the supplier what actually happened.
        const status = await merchantBookingStatus({
          partnerBookingRef: data.partnerBookingRef,
        });
        if (status.ok && status.state !== "pending" && status.state !== "failed") {
          await updateMerchantBooking({
            partnerBookingRef: data.partnerBookingRef,
            status: status.state,
            ...(status.voucherUrl ? { voucherUrl: status.voucherUrl } : {}),
          });
          return {
            ok: status.state === "confirmed",
            partnerBookingRef: data.partnerBookingRef,
            state: status.state,
            ...(status.voucherUrl ? { voucherUrl: status.voucherUrl } : {}),
          };
        }
        await updateMerchantBooking({
          partnerBookingRef: data.partnerBookingRef,
          status: "pending",
          failureReason: "Supplier confirmation timed out — status is being verified.",
        });
        return {
          ok: false as const,
          indeterminate: true as const,
          partnerBookingRef: data.partnerBookingRef,
          state: "pending" as const,
          error: "The supplier is still confirming this booking. Check your bookings shortly.",
        };
      }
      await releaseMerchantClaim(
        data.partnerBookingRef,
        result.error ?? "Supplier rejected the booking.",
      );
      return {
        ok: false as const,
        partnerBookingRef: data.partnerBookingRef,
        state: "held" as const,
        ...(result.error ? { error: result.error } : {}),
      };
    }

    await updateMerchantBooking({
      partnerBookingRef: data.partnerBookingRef,
      status: result.state,
      ...(result.bookingRef ? { bookingRef: result.bookingRef } : {}),
      ...(result.voucherUrl ? { voucherUrl: result.voucherUrl } : {}),
      ...(result.retailPrice !== null ? { retailPrice: result.retailPrice } : {}),
      cancellation: result.cancellationPolicy ?? undefined,
    });
    return {
      ok: result.state === "confirmed",
      partnerBookingRef: data.partnerBookingRef,
      state: result.state,
      ...(result.voucherUrl ? { voucherUrl: result.voucherUrl } : {}),
      ...(result.state !== "confirmed"
        ? { error: "The supplier has not confirmed yet — check your bookings shortly." }
        : {}),
    };
  });

export const refreshMerchantBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ partnerBookingRef: z.string().regex(/^WWT-MERCH-\d+$/) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const record = await getMerchantBooking(data.partnerBookingRef);
    if (!record || record.user_id !== context.userId) {
      return { ok: false as const, error: "Booking not found." };
    }
    const status = await merchantBookingStatus(
      record.booking_ref
        ? { bookingRef: record.booking_ref }
        : { partnerBookingRef: record.partner_booking_ref },
    );
    if (!status.ok) {
      return { ok: false as const, ...(status.error ? { error: status.error } : {}) };
    }
    if (status.state !== record.status) {
      await updateMerchantBooking({
        partnerBookingRef: record.partner_booking_ref,
        status: status.state,
        ...(status.voucherUrl ? { voucherUrl: status.voucherUrl } : {}),
      });
    }
    return {
      ok: true as const,
      state: status.state,
      status: status.status,
      ...(status.voucherUrl ? { voucherUrl: status.voucherUrl } : {}),
    };
  });

export const cancelMerchantExperience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        partnerBookingRef: z.string().regex(/^WWT-MERCH-\d+$/),
        reasonCode: z.string().trim().min(3).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const record = await getMerchantBooking(data.partnerBookingRef);
    if (!record || record.user_id !== context.userId) {
      return { ok: false as const, error: "Booking not found." };
    }
    if (record.status !== "confirmed" && record.status !== "pending") {
      return { ok: false as const, error: "Only confirmed bookings can be cancelled." };
    }
    if (!record.booking_ref) {
      return { ok: false as const, error: "This booking has no supplier reference yet." };
    }
    const quote = await merchantCancelQuote(record.booking_ref);
    if (!quote.ok) {
      return { ok: false as const, ...(quote.error ? { error: quote.error } : {}) };
    }
    if (quote.status !== "CANCELLABLE") {
      return { ok: false as const, error: "This booking is not cancellable with the supplier." };
    }
    const cancel = await merchantCancelBooking({
      bookingRef: record.booking_ref,
      reasonCode: data.reasonCode,
    });
    if (!cancel.ok) {
      return { ok: false as const, ...(cancel.error ? { error: cancel.error } : {}) };
    }
    await updateMerchantBooking({
      partnerBookingRef: record.partner_booking_ref,
      status: "cancelled",
      cancellation: {
        quote,
        reasonCode: data.reasonCode,
        supplierStatus: cancel.status,
      },
    });
    return {
      ok: true as const,
      state: "cancelled" as const,
      refundAmount: quote.refundAmount,
      refundPercentage: quote.refundPercentage,
      currency: quote.currency,
    };
  });

export const listMyMerchantBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    ok: true as const,
    bookings: await listMerchantBookingsForUser(context.userId),
  }));

// ------------------------------------------------------------ admin (staff)

async function assertStaff(supabase: unknown, userId: string): Promise<void> {
  const client = supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc("is_staff", { _user_id: userId });
  if (error || data !== true) throw new Error("Forbidden");
}

export const adminListMerchantBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    return { ok: true as const, bookings: await listAllMerchantBookings() };
  });

export const adminMerchantSmokeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const steps: { step: string; ok: boolean; detail?: string }[] = [];
    const search = await merchantSearch({ query: "london", count: 3 });
    steps.push({
      step: "freetext search",
      ok: search.ok,
      detail: search.ok ? `${search.totalCount} products` : (search.error ?? "failed"),
    });
    const code = search.products[0]?.productCode;
    if (code) {
      const product = await merchantProduct(code);
      steps.push({
        step: "product detail",
        ok: product.ok,
        detail: product.ok ? product.product?.title : (product.error ?? "failed"),
      });
      const inFuture = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
      const avail = await merchantAvailability({
        productCode: code,
        travelDate: inFuture,
        paxMix: [{ ageBand: "ADULT", count: 2 }],
      });
      steps.push({
        step: "availability",
        ok: avail.ok,
        detail: avail.ok ? `${avail.slots.length} slots` : (avail.error ?? "failed"),
      });
    }
    return {
      ok: steps.every((s) => s.ok),
      environment: "sandbox" as const,
      bookingMode: "merchant — no supplier payment session (sandbox-verified)",
      steps,
    };
  });
