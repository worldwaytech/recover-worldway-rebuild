// Worldway Travel Commerce service (server-only).
// ONE capability layer shared by the AI Concierge, the MCP server and the partner
// Travel Commerce API. It only calls the existing engine/adapters — no new
// supplier logic — and every result leaves through the supplier-privacy guard.
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iataOrCity = z.string().trim().min(2).max(60);

export const CommerceSchemas = {
  searchFlights: z.object({
    origin: iataOrCity, destination: iataOrCity, depart_date: date, return_date: date.optional(),
    passengers: z.number().int().min(1).max(9).default(1),
    cabin: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  }),
  searchTours: z.object({
    query: z.string().trim().max(80).optional(), city: z.string().trim().max(60).optional(), country: z.string().trim().max(60).optional(),
    duration: z.enum(["day", "2-4", "5-8", "9+"]).optional(), page: z.number().int().min(1).max(50).default(1),
  }),
  tourAvailability: z.object({ tour_id: z.string().regex(/^[\w-]{2,200}$/), from_date: date, travellers: z.number().int().min(1).max(40) }),
  quoteTour: z.object({
    tour_id: z.string().regex(/^[\w-]{2,200}$/), date, service: z.enum(["regular", "private"]),
    adults: z.number().int().min(1).max(40), children: z.number().int().min(0).max(20).default(0), infants: z.number().int().min(0).max(10).default(0),
  }),
  planTrip: z.object({
    origin: iataOrCity, destination: iataOrCity, depart_date: date, return_date: date,
    adults: z.number().int().min(1).max(9), children: z.number().int().min(0).max(8).default(0),
    tour_ref: z.string().regex(/^tour:[\w-]+\|\d{4}-\d{2}-\d{2}\|(regular|private)$/).optional(),
    tour_query: z.string().max(80).optional(),
  }),
};

export type CommerceOp = keyof typeof CommerceSchemas;

async function safe<T>(v: T): Promise<T> {
  const { sanitizeOutbound } = await import("@/lib/confidentiality/guard.server");
  return sanitizeOutbound(v, { absolute: true });
}

const TOUR_FIELDS = (t: any) => ({
  tour_id: t.slug, name: t.name, summary: t.summary ?? null, category: t.category_name ?? null, country: t.country ?? null,
  destinations: Array.isArray(t.destinations) ? t.destinations.slice(0, 8) : [], duration_days: t.duration_days ?? null,
  rating: t.rating ?? null, reviews: t.review_count ?? 0, from_price: t.price_from != null ? { amount: t.price_from, currency: t.currency } : null,
  price_note: "Indicative 'from' price — live price is confirmed by quote_tour.",
});

export async function runCommerce(op: CommerceOp, raw: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const parsed = CommerceSchemas[op].safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  const input: any = parsed.data;
  const started = Date.now();
  try {
    const out = await dispatch(op, input);
    console.info("[commerce]", JSON.stringify({ op, ms: Date.now() - started, ok: out.ok }));
    return await safe(out);
  } catch (e) {
    console.error("[commerce] failure", JSON.stringify({ op, ms: Date.now() - started, error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
    return { ok: false, error: "This service is temporarily unavailable. Please try again shortly." };
  }
}

async function dispatch(op: CommerceOp, input: any): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  switch (op) {
    case "searchFlights": {
      const { searchFlightsViaEngine } = await import("@/lib/flights/flight-adapters.server");
      const { outcomes: _routing, ...res } = await searchFlightsViaEngine({ ...input, passengers: input.passengers ?? 1, cabin: input.cabin ?? "economy" });
      const r: any = res;
      const offers = Array.isArray(r.offers ?? r.data?.offers) ? (r.offers ?? r.data.offers) : null;
      return { ok: !!r.ok, data: offers ? { count: offers.length, offers: offers.slice(0, 15) } : r, error: r.ok ? undefined : r.error };
    }
    case "searchTours": {
      const { searchTours } = await import("@/lib/travelshop/catalogue.server");
      const r: any = await searchTours({ query: input.query, city: input.city, country: input.country, duration: input.duration, page: input.page, sort: "popular" });
      return { ok: true, data: { total: r.total ?? r.count ?? null, page: input.page, tours: (r.tours ?? r.items ?? []).slice(0, 12).map(TOUR_FIELDS) } };
    }
    case "tourAvailability": {
      const { liveAvailability } = await import("@/lib/travelshop/catalogue.server");
      const a = await liveAvailability(input.tour_id, input.from_date, input.travellers);
      return { ok: true, data: { checked_at: a.checkedAt, max_travellers: a.maxPax, dates: a.dates.slice(0, 30), note: "Prices are per adult, Worldway customer prices, live." } };
    }
    case "quoteTour": {
      const { liveQuote } = await import("@/lib/travelshop/catalogue.server");
      const q: any = await liveQuote({ slug: input.tour_id, date: input.date, service: input.service, adults: input.adults, children: input.children, infants: input.infants });
      if (!q.ok) return { ok: false, error: q.reason };
      return { ok: true, data: { tour_id: input.tour_id, date: input.date, service: input.service, total: { amount: q.customerTotal, currency: q.currency }, checked_at: q.checkedAt, bookable_online: false, booking: "Booking is confirmed by the Worldway team." } };
    }
    case "planTrip": {
      const { assembleAndSave } = await import("@/lib/engine/suppliers/proposals.functions");
      const r: any = await assembleAndSave("", {
        origin: input.origin, destinations: [input.destination], departFrom: input.depart_date, returnBy: input.return_date,
        adults: input.adults, children: input.children ?? 0, luxuryLevel: 3, interests: [],
      }, false, { tourRef: input.tour_ref, tourQuery: input.tour_query });
      return {
        ok: true,
        data: {
          arrival_date: r.arrivalDate, departure_date: r.departureDate, fx: r.fx, fx_error: r.fxError ?? null,
          proposals: r.proposals.slice(0, 2).map((p: any) => ({ total: p.total, currency: p.currency, bookable: p.bookable, blockers: p.blockers, components: p.components, on_request: p.onRequest })),
          tours: r.tours.slice(0, 8), selected_tour: r.selectedTour,
          optional_stays: r.optionalStays, optional_stays_note: "Optional — never included in any total unless the customer asks.",
        },
      };
    }
  }
}
