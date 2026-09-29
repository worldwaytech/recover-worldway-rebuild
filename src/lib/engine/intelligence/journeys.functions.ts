// Journey persistence API (no customer UI yet). Access is checked through RLS
// with the caller's own session before any server-side write.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Moment = z.object({ at: z.string(), timezone: z.string(), place: z.string(), lat: z.number().optional(), lng: z.number().optional() });
const Money = z.object({ amount: z.number(), currency: z.string().length(3) });
const Offer = z.object({
  supplierKey: z.string(), kind: z.enum(["flight", "stay", "activity", "transfer", "cruise", "insurance", "aviation", "rail"]),
  externalId: z.string(), title: z.string(), start: Moment, end: Moment, net: Money, taxes: Money.optional(),
  refundable: z.boolean(), freeCancelUntil: z.string().optional(), quality: z.number().optional(), revalidatedAt: z.string().optional(),
});
const Change = z.union([
  z.object({ type: z.literal("replace"), externalId: z.string(), with: Offer }),
  z.object({ type: z.literal("remove"), externalId: z.string() }),
  z.object({ type: z.literal("add"), offer: Offer }),
  z.object({ type: z.literal("rollback"), toVersion: z.number().int().min(1) }),
]);
const Req = z.object({
  origin: z.string(), destinations: z.array(z.string()), departFrom: z.string(), returnBy: z.string(),
  adults: z.number().int().min(1), children: z.number().int().min(0), luxuryLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), interests: z.array(z.string()),
});

type Db = { from: (t: string) => any };

async function service() {
  const [{ JourneyService }, { supabaseJourneyRepo }, { supplierRegistry }] = await Promise.all([
    import("./store"), import("./store.server"), import("../suppliers/catalog.server"),
  ]);
  return new JourneyService(supabaseJourneyRepo, (j) => ({
    requirements: j.requirements as any,
    registry: supplierRegistry(),
    currency: j.currency,
    // Only same-currency pricing until a live FX source is connected — never guessed rates.
    fx: { [j.currency]: 1 },
    ruleFor: () => ({ markupPercent: 0, commissionPercent: 0, serviceFee: 0 }),
  }));
}

/** RLS check with the caller's session: owner or staff only. */
async function assertAccess(sb: unknown, journeyId: string) {
  const { data } = await (sb as Db).from("journeys").select("id").eq("id", journeyId).maybeSingle();
  if (!data) throw new Error("Journey not found");
}

export const createJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offers: z.array(Offer).min(1).max(40), currency: z.string().length(3), requirements: Req }).parse(d))
  .handler(async ({ data, context }) => {
    const j = await (await service()).create(context.userId, data.offers, data.currency, data.requirements);
    return { id: j.id, version: 1 };
  });

export const simulateJourneyChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ journeyId: z.string().uuid(), change: Change }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.journeyId);
    const s = await (await service()).simulate(data.journeyId, data.change, context.userId);
    return { simulationId: s.id, requiresApproval: s.requires_approval, bookableAfter: s.bookable_after, priceDelta: s.price_delta, impacted: s.impacted, material: s.material, newIssues: s.new_issues };
  });

export const decideJourneyChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ simulationId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sim } = await (context.supabase as unknown as Db).from("journey_simulations").select("journey_id").eq("id", data.simulationId).maybeSingle();
    if (!sim) throw new Error("Simulation not found");
    return (await service()).decide(data.simulationId, data.decision, context.userId, data.note);
  });

export const getJourneyHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ journeyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Db;
    await assertAccess(sb, data.journeyId);
    const [j, v, s, a, e] = await Promise.all([
      sb.from("journeys").select("id, state, current_version, currency, created_at, updated_at").eq("id", data.journeyId).single(),
      sb.from("journey_versions").select("version, parent_version, bookable, reason, pricing, issues, created_at").eq("journey_id", data.journeyId).order("version"),
      sb.from("journey_simulations").select("id, base_version, change, status, requires_approval, bookable_after, price_delta, material, impacted, created_at").eq("journey_id", data.journeyId).order("created_at"),
      sb.from("journey_approvals").select("simulation_id, decision, decided_by, note, created_at").eq("journey_id", data.journeyId).order("created_at"),
      sb.from("journey_events").select("event_type, from_state, to_state, version, detail, created_at").eq("journey_id", data.journeyId).order("created_at"),
    ]);
    return { journey: j.data, versions: v.data ?? [], simulations: s.data ?? [], approvals: a.data ?? [], events: e.data ?? [] };
  });

/** Disruption advisories from stored supplier health — no invented schedule events. */
export const getJourneyHealthAdvisories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ journeyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.journeyId);
    const svc = await service();
    const { ctx } = await svc.context(data.journeyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: health } = await (supabaseAdmin as unknown as Db).from("supplier_health_status").select("supplier_key, status, last_error, last_checked_at");
    const { healthAdvisories } = await import("./disruption");
    return { advisories: healthAdvisories(ctx, health ?? []) };
  });
