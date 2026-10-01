// Worldway tour marketplace server functions. Public read-only catalogue and
// live availability/pricing; authenticated booking requests; staff sync/admin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: { userId: string; supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } }) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden");
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,200}$/);

export const searchTourMarketplace = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({
      query: z.string().max(120).optional(),
      destination: z.string().max(120).optional(),
      country: z.string().max(120).optional(),
      region: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      category: z.string().max(120).optional(),
      activity: z.string().max(120).optional(),
      language: z.string().max(60).optional(),
      duration: z.enum(["day", "2-4", "5-8", "9+"]).optional(),
      minPrice: z.number().min(0).max(1_000_000).optional(),
      maxPrice: z.number().min(0).max(1_000_000).optional(),
      minRating: z.number().min(0).max(5).optional(),
      sort: z.enum(["popular", "price-asc", "price-desc", "rating", "duration"]).optional(),
      page: z.number().int().min(1).max(2000).optional(),
    }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const { searchTours } = await import("./catalogue.server");
    try {
      return { ...(await searchTours(data)), error: null as string | null };
    } catch {
      return { items: [], total: 0, page: data.page ?? 1, pageSize: 24, error: "Catalogue temporarily unavailable" };
    }
  });

export const getTourFacets = createServerFn({ method: "GET" }).handler(async () => {
  const { facets } = await import("./catalogue.server");
  return facets();
});

export const getTourExplore = createServerFn({ method: "GET" }).handler(async () => {
  const { explore } = await import("./catalogue.server");
  return explore();
});

export const getCountryGuide = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ country: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const { countryGuide } = await import("./catalogue.server");
    return countryGuide(data.country);
  });

export const getTourDetail = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ slug }).parse(i))
  .handler(async ({ data }) => {
    const { getTour } = await import("./catalogue.server");
    return getTour(data.slug);
  });

export const getTourLiveAvailability = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ slug, from: date, pax: z.number().int().min(1).max(60) }).parse(i))
  .handler(async ({ data }) => {
    const { liveAvailability } = await import("./catalogue.server");
    try {
      return { ...(await liveAvailability(data.slug, data.from, data.pax)), error: null as string | null };
    } catch (e) {
      console.error("[tours] live availability failed", e instanceof Error ? e.message : e);
      return { checkedAt: new Date().toISOString(), maxPax: 0, dates: [], error: "Live availability is temporarily unavailable." };
    }
  });

const quoteInput = z.object({
  slug, date, service: z.enum(["private", "regular"]),
  adults: z.number().int().min(1).max(60), children: z.number().int().min(0).max(30), infants: z.number().int().min(0).max(10),
});

export const getTourLiveQuote = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => quoteInput.parse(i))
  .handler(async ({ data }) => {
    const { liveQuote } = await import("./catalogue.server");
    try {
      const q = await liveQuote(data);
      return q.ok ? { ok: true as const, currency: q.currency, total: q.customerTotal, checkedAt: q.checkedAt } : q;
    } catch (e) {
      console.error("[tours] live quote failed", e instanceof Error ? e.message : e);
      return { ok: false as const, reason: "Live pricing is temporarily unavailable." };
    }
  });

export const requestTourBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    quoteInput.extend({
      rooms: z.object({ single: z.number().int().min(0).max(20).optional(), double: z.number().int().min(0).max(20).optional(), triple: z.number().int().min(0).max(20).optional() }).optional(),
      lead: z.object({
        firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
        email: z.string().trim().email().max(200), phone: z.string().trim().min(5).max(30), nationality: z.string().trim().max(60).optional(),
        title: z.enum(["Mr", "Mrs", "Ms", "Miss", "Dr"]).optional(),
        phoneCountryCode: z.string().trim().regex(/^\+?\d{1,4}$/).optional(),
      }),
      specialRequests: z.string().trim().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { prepareTourBooking, customerPayable } = await import("./booking.server");
    const r = await prepareTourBooking({ ...data, lead: { ...data.lead, phone: data.lead.phone.replace(/\D/g, "") }, userId: context.userId });
    return r.ok ? { ...r, payable: await customerPayable(r.booking.id as string).catch(() => false) } : r;
  });

export const listMyTourBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCustomerTourBookings } = await import("./booking.server");
    return listCustomerTourBookings(context.userId);
  });

export const getMyTourBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { getCustomerTourBooking } = await import("./booking.server");
    return getCustomerTourBooking(context.userId, data.id);
  });

// ------------------------------------------------------------------ staff

export const staffRefundTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ bookingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { staffRefundTourPayment } = await import("./booking.server");
    return staffRefundTourPayment(data.bookingId, { id: context.userId, email: (context.claims as { email?: string } | undefined)?.email ?? null });
  });

export const getTourSupplierOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncOverview } = await import("./sync.server");
    const { tourBookingsEnabled } = await import("./booking.server");
    const { tourPricingRule } = await import("./catalogue.server");
    const bookings = await supabaseAdmin
      .from("travelshop_bookings")
      .select("id, tour_name, tour_date, adults, children, customer_currency, customer_total, supplier_retail_total, status, supplier_reference_id, created_at")
      .order("created_at", { ascending: false }).limit(25);
    return { ...(await syncOverview(supabaseAdmin as never)), bookingsEnabled: tourBookingsEnabled(), pricing: tourPricingRule(), bookings: bookings.data ?? [] };
  });

export const checkTourApiHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { apiHealth } = await import("./catalogue.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: totals } = await supabaseAdmin.rpc("travelshop_catalogue_totals" as never);
    return { health: await apiHealth(), counts: (totals ?? {}) as Record<string, number> };
  });

export const runTourCatalogueSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startRun, continueRun } = await import("./sync.server");
    const id = await startRun(supabaseAdmin as never, "manual", "full");
    return continueRun(supabaseAdmin as never, id, Date.now() + 25_000);
  });

export const getTourBookingGates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tourBookingsEnabled } = await import("./booking.server");
    const { bookingGates, contractComplete, CONTRACT_EVIDENCE, UNVERIFIED } = await import("./booking-contract");
    const { partnerCountries } = await import("./countries.server");
    const countries = await partnerCountries().catch(() => []);
    void supabaseAdmin;
    const { certificationStatus } = await import("./certification.server");
    const cert = await certificationStatus();
    const kindGates = (k: "per_person" | "room") => bookingGates({ flagEnabled: tourBookingsEnabled(), contractComplete: contractComplete(countries), verifiedStaffBooking: cert[k].certified, certified: cert[k].certified });
    return {
      gates: kindGates("per_person").filter((g) => g.kind === "live"),
      evidenceStatus: (["per_person", "room"] as const).map((k) => ({ kind: k === "room" ? "Room-priced tours" : "Per-person tours", verified: cert[k].certified, at: cert[k].at })),
      certification: cert,
      evidence: { ...CONTRACT_EVIDENCE, partnerCountries: countries.length }, unverified: Object.values(UNVERIFIED),
    };
  });

export const staffSendTourToPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ bookingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { createSupplierBooking } = await import("./booking.server");
    return createSupplierBooking(data.bookingId, { id: context.userId, email: (context.claims as { email?: string } | undefined)?.email ?? null });
  });

export const staffPrepareTourPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    slug: z.string().trim().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    service: z.enum(["regular", "private"]),
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(10),
    lead: z.object({
      title: z.enum(["Mr", "Mrs", "Ms", "Miss", "Dr"]),
      firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(255),
      phoneCountryCode: z.string().trim().regex(/^\+?\d{1,4}$/),
      phone: z.string().trim().regex(/^\d{5,15}$/),
    }),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { staffPrepareTourPayment } = await import("./booking.server");
    return staffPrepareTourPayment({ ...data, infants: 0, userId: (context as { userId: string }).userId });
  });
