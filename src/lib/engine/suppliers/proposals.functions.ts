// Live proposal assembly + persistence + change rebuild (server functions, no UI).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Db = { from: (t: string) => any };

const Req = z.object({
  origin: z.string().min(2), destinations: z.array(z.string().min(2)).min(1).max(5), departFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), adults: z.number().int().min(1).max(9), children: z.number().int().min(0).max(8),
  luxuryLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), interests: z.array(z.string()).max(10),
  budget: z.object({ amount: z.number().positive(), currency: z.string().length(3) }).optional(),
});

export async function journeyServiceFor() {
  const [{ JourneyService }, { supabaseJourneyRepo }, { supplierRegistry }, { commercialRuleFor }] = await Promise.all([
    import("@/lib/engine/intelligence/store"), import("@/lib/engine/intelligence/store.server"),
    import("./catalog.server"), import("./commercial.server"),
  ]);
  return new JourneyService(supabaseJourneyRepo, (j) => ({ requirements: j.requirements as any, registry: supplierRegistry(), currency: j.currency, fx: { [j.currency]: 1 }, ruleFor: commercialRuleFor }));
}

export async function assembleAndSave(userId: string, requirements: z.infer<typeof Req>, save: boolean, opts: { tourRef?: string; tourQuery?: string } = {}) {
  const { assembleLiveProposals } = await import("./assembly.server");
  const { explainPackage } = await import("@/lib/engine/intelligence/explain");
  const report = await assembleLiveProposals(requirements, opts);
  const { commercialRuleFor } = await import("./commercial.server");
  const svc = save ? await journeyServiceFor() : null;
  const proposals = [];
  for (const p of report.proposals) {
    const e = explainPackage(p.result);
    const explanation = [e.headline, ...e.reasons, ...e.cautions.map((c) => `Note: ${c}`)].join(". ");
    let journeyId: string | null = null;
    if (svc) journeyId = (await svc.create(userId, p.offers, report.currency, requirements, { explanation, readiness: p.readiness, on_request: p.onRequest, sources: report.sources })).id;
    proposals.push({
      journeyId, score: p.result.score, bookable: p.readiness.bookable, blockers: p.readiness.blockers,
      total: p.result.pricing?.total ?? null, currency: report.currency, explanation,
      components: p.result.graph.map((c) => ({ kind: c.kind, title: c.title, start: c.start, end: c.end, status: p.readiness.perComponent.find((x) => x.externalId === c.externalId)?.status ?? "LIVE" })),
      onRequest: p.onRequest, factors: p.result.factors,
    });
  }
  // Optional stays: shown with the live customer price; never part of any proposal, itinerary, booking or total.
  const optionalStays = report.optionalStays.map((o) => ({
    tourRef: o.tourRef, tourTitle: o.tourTitle, position: o.position, checkin: o.checkin, checkout: o.checkout, optional: true as const,
    hotels: o.offers.map((h) => {
      const r = commercialRuleFor(h);
      return { title: h.title, price: r ? { amount: Math.round((h.net.amount * (1 + r.markupPercent / 100) + r.serviceFee) * 100) / 100, currency: h.net.currency } : null };
    }),
  }));
  const tourDto = (t: (typeof report.tours)[number]) => ({ ref: t.ref, title: t.title, startDate: t.startDate, endDate: t.endDate, durationDays: t.durationDays ?? null, accommodationIncluded: !!t.accommodationIncluded, price: t.indicativeFrom, image: t.image ?? null, note: t.reason });
  return {
    sources: report.sources, proposals, optionalStays,
    fx: report.fx.provider ? { provider: report.fx.provider, ratesAt: report.fx.ratesAt, fetchedAt: report.fx.fetchedAt ?? null, rates: report.fx.rates, target: report.fx.target } : null,
    fxError: report.fx.error,
    arrivalDate: report.arrivalDate, departureDate: report.departureDate,
    tours: report.tours.map(tourDto),
    selectedTour: report.selectedTour ? { ...tourDto(report.selectedTour), coversNights: report.selectedTour.coversNights } : null,
  };
}

export const assembleProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    requirements: Req, save: z.boolean().default(true),
    tourRef: z.string().regex(/^tour:[\w-]+\|\d{4}-\d{2}-\d{2}\|(regular|private)$/).optional(),
    tourQuery: z.string().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => assembleAndSave(context.userId, data.requirements, data.save, { tourRef: data.tourRef, tourQuery: data.tourQuery }));

/** Change → live search → rebuild component → rerank/reprice/revalidate/re-audit → pending approvals. */
export const rebuildJourneyComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ journeyId: z.string().uuid(), externalId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Db;
    const { data: j } = await sb.from("journeys").select("id").eq("id", data.journeyId).maybeSingle();
    if (!j) throw new Error("Journey not found");
    return rebuild(data.journeyId, data.externalId, context.userId);
  });

export async function rebuild(journeyId: string, externalId: string, userId: string) {
  const svc = await journeyServiceFor();
  const { row, ctx } = await svc.context(journeyId);
  const target = ctx.offers.find((o) => o.externalId === externalId);
  if (!target) throw new Error("Component not in journey");
  const { liveAlternativesFor } = await import("./assembly.server");
  const alts = await liveAlternativesFor(target, row.requirements as any);
  if (!alts.length) return { alternatives: [], message: "No live alternatives available; component stays on request." };
  const { rankAlternatives } = await import("@/lib/engine/intelligence/simulate");
  const { supplierRegistry } = await import("./catalog.server");
  const { commercialRuleFor } = await import("./commercial.server");
  const ranked = rankAlternatives(ctx, externalId, alts, { requirements: row.requirements as any, registry: supplierRegistry(), currency: row.currency, fx: { [row.currency]: 1 }, ruleFor: commercialRuleFor }).slice(0, 3);
  const alternatives = [];
  for (const r of ranked) {
    if (r.change.type !== "replace") continue;
    const s = await svc.simulate(journeyId, r.change, userId);
    alternatives.push({ simulationId: s.id, title: r.change.with.title, priceDelta: s.price_delta, material: s.material, impacted: s.impacted, bookableAfter: s.bookable_after, requiresApproval: s.requires_approval });
  }
  return { alternatives, message: null };
}
