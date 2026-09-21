// Server-authoritative catalogue booking requests.
//
// The browser may only state WHAT a guest wants (product, departure, guests,
// room type). Price, status and balances are always recomputed on the server
// from the published catalogue, so a tampered client cannot create a confirmed
// or under-priced booking. Confirmation happens only after a verified payment
// or a staff action — never from this entry point.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCatalogueProductBySlug } from "@/lib/catalogue-engine";
import type { CollectionKind } from "@/lib/catalogue-types";
import { departureOptions, priceBreakdown } from "@/lib/itinerary";

const inputSchema = z.object({
  kind: z.string().min(1).max(60),
  slug: z.string().min(1).max(160),
  departureDate: z.string().min(4).max(40),
  guests: z.number().int().min(1).max(8),
  singleRoom: z.boolean(),
  payFull: z.boolean(),
});

export interface BookingEnquiryResult {
  reference: string;
  status: string;
  currency: string;
  total: number;
  amountDue: number;
  balanceDue: number;
}

function reference(slug: string): string {
  const stem = slug.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "WWLUXE";
  return `WW-${stem}-${Date.now().toString(36).toUpperCase()}`;
}

export const createBookingEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<BookingEnquiryResult> => {
    const product = getCatalogueProductBySlug(data.kind as CollectionKind, data.slug);
    if (!product) throw new Error("This experience is no longer available.");
    if ((product.priceFrom ?? 0) <= 0)
      throw new Error("This experience is quoted on request — please send an enquiry.");

    // The departure must be one the catalogue actually publishes.
    const departure = departureOptions(product).find((d) => d.date === data.departureDate);
    if (!departure) throw new Error("That departure is no longer open for booking.");

    // Authoritative pricing: never trusted from the browser.
    const price = priceBreakdown(product, data.guests, departure, data.singleRoom);
    const currency = "USD";
    const amountDue = data.payFull ? price.total : price.depositDue;
    const ref = reference(product.slug);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: context.userId,
        reference: ref,
        product_type: product.kind,
        title: product.title,
        supplier: product.supplier ?? null,
        travel_date: departure.date,
        // Awaiting payment: no money has been verified at this point.
        status: "pending",
        currency,
        amount: price.total,
        amount_paid: 0,
        balance_due: price.total,
        deposit_amount: price.depositDue,
        supplier_status: "not-sent",
        details: {
          guests: data.guests,
          singleRoom: data.singleRoom,
          perGuest: price.perGuest,
          subtotal: price.subtotal,
          singleSupplement: price.singleSupplement,
          taxes: price.taxes,
          total: price.total,
          amountDue,
          paymentPlan: data.payFull ? "full" : "deposit",
          location: product.location ?? null,
          slug: product.slug,
          pricedBy: "server",
        },
      })
      .select("id, reference, status")
      .single();

    if (error || !inserted) throw new Error(error?.message ?? "Booking request could not be created.");

    await supabaseAdmin.from("booking_events").insert({
      booking_id: inserted.id,
      event_type: "booking.requested",
      summary: `Booking request received for ${product.title}`,
      visibility: "customer",
      actor_label: "Customer",
      actor_id: context.userId,
      detail: {
        departure: departure.date,
        guests: data.guests,
        amountDue,
        currency,
      },
    });

    return {
      reference: inserted.reference,
      status: inserted.status,
      currency,
      total: price.total,
      amountDue,
      balanceDue: price.total,
    };
  });
