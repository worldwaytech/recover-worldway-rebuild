import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAYMENT_PURPOSES, type PaymentPurpose } from "./plans";

const purposeSchema = z.enum(PAYMENT_PURPOSES as [PaymentPurpose, ...PaymentPurpose[]]);

const createOrderSchema = z
  .object({
    purpose: purposeSchema,
    /** Amount in major units (e.g. 4999.50). Ignored for membership purchases. */
    amount: z.number().positive().max(20_000_000).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((v) => v.toUpperCase())
      .default("INR"),
    planId: z.string().trim().max(40).optional(),
    description: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(255).optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    reference: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    /** Flight fare to re-price server-side; the charged amount comes from this, not `amount`. */
    flightFare: z
      .object({
        resultIndex: z.string().trim().min(1).max(200),
        searchTokenId: z.string().trim().min(1).max(200),
        extras: z
          .array(
            z
              .object({
                baggage: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
                meal: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
                seat: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
              })
              .strict(),
          )
          .max(9)
          .optional(),
      })
      .strict()
      .optional(),
    /** Pending pre-purchased flight booking; amount comes from the server-side record. */
    prePurchasedBookingId: z.string().uuid().optional(),
    /** Worldway private aviation reference; amount comes from the confirmed quote on the server. */
    aviationReference: z.string().regex(/^WWPA-\d{6}-[0-9A-F]{6}$/).optional(),
  })
  .strict();

const verifySchema = z
  .object({
    orderId: z.string().trim().min(6).max(80),
    paymentId: z.string().trim().min(6).max(80),
    signature: z.string().trim().min(16).max(200),
  })
  .strict();

/** Opens a Razorpay order. Amounts are always resolved server-side and never trusted from the client. */
export const createPaymentOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolvePaymentAmount, openOrder } = await import("./checkout.server");
    try {
      const { flightFare: _ff, prePurchasedBookingId, aviationReference, ...rest } = data;
      const amount = await resolvePaymentAmount(data);
      if (prePurchasedBookingId) rest.reference = { ...(rest.reference ?? {}), booking_id: prePurchasedBookingId };
      if (aviationReference) rest.reference = { ...(rest.reference ?? {}), aviation_reference: aviationReference };
      return await openOrder({ ...rest, ...amount });
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Could not start the payment.",
      };
    }
  });

/** Verifies the Razorpay checkout handoff signature and confirms capture with Razorpay. */
export const verifyPaymentSignature = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const { confirmPayment } = await import("./checkout.server");
    try {
      return await confirmPayment(data);
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Payment verification failed.",
      };
    }
  });
