/**
 * Viator Affiliate Full + Booking checkout — Worldway collects payment
 * (Razorpay or Worldway Wallet) through the shared paid-booking engine.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  productCode: text(40).min(1),
  productTitle: text(300).optional(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  paxMix: z.array(z.object({ ageBand: text(20).min(1), count: z.number().int().min(1).max(30) })).min(1).max(8),
  productOptionCode: text(60).optional(),
  startTime: text(10).optional(),
  languageGuide: z.object({ type: text(30).min(1), language: text(20).min(1) }).optional(),
  booker: z.object({ firstName: text(60).min(1), lastName: text(60).min(1), email: z.string().trim().email().max(120), phone: text(20).optional() }),
  travellers: z.array(z.object({ firstName: text(60), lastName: text(60) })).max(30),
  bookingQuestionAnswers: z
    .array(z.object({ question: text(60).min(1), answer: text(500), travelerNum: z.number().int().min(1).max(30).optional(), unit: text(40).optional() }))
    .max(200),
});

export const prepareViatorActivityBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { prepareViatorPaidBooking } = await import("./paid-booking.server");
    try {
      return await prepareViatorPaidBooking((context as { userId: string }).userId, data as never);
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not start this booking." };
    }
  });
