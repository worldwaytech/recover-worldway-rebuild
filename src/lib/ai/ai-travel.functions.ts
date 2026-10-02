// Controlled AI travel layer. AI understands and explains; Worldway's deterministic
// engines stay authoritative for inventory, prices, schedules, FX and booking status.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseConversation } from "@/lib/engine/intelligence/commerce";

type Db = { from: (t: string) => any };

const Input = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(8000) }),
  z.object({ type: z.literal("email"), subject: z.string().max(300).optional(), body: z.string().min(1).max(12000) }),
  z.object({ type: z.literal("pdf"), base64: z.string().max(8_000_000) }),
  z.object({ type: z.literal("image"), base64: z.string().max(6_000_000), mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]) }),
  z.object({ type: z.literal("url"), url: z.string().url().max(2000) }),
  z.object({ type: z.literal("transcript"), source: z.enum(["whatsapp", "voice", "chat"]), text: z.string().min(1).max(60000) }),
]);

/** WhatsApp exports / voice or chat transcripts → plain text for the existing request reader. */
function normaliseInputs(inputs: z.infer<typeof Input>[]) {
  return inputs.map((i) => i.type === "transcript"
    ? { type: "text" as const, text: `${i.source === "whatsapp" ? "WhatsApp chat" : i.source === "voice" ? "Voice call transcript" : "Chat transcript"}:\n${normaliseConversation(i.text, 7800)}` }
    : i);
}

async function loadDna(sb: Db) {
  const { data } = await sb.from("travel_dna").select("consent_preferences, consent_history, preferences").maybeSingle();
  const p = (data?.preferences ?? {}) as Record<string, any>;
  return {
    consent: { preferences: !!data?.consent_preferences, history: !!data?.consent_history },
    interests: Array.isArray(p.interests) ? p.interests : [], avoid: Array.isArray(p.avoid) ? p.avoid : [],
    pace: p.pace, luxuryLevel: p.luxuryLevel, arrivalRestHours: p.arrivalRestHours, prefersRefundable: p.prefersRefundable,
  };
}

async function journeyService() {
  const [{ JourneyService }, { supabaseJourneyRepo }, { supplierRegistry }, { commercialRuleFor }] = await Promise.all([
    import("@/lib/engine/intelligence/store"), import("@/lib/engine/intelligence/store.server"),
    import("@/lib/engine/suppliers/catalog.server"), import("@/lib/engine/suppliers/commercial.server"),
  ]);
  return new JourneyService(supabaseJourneyRepo, (j) => ({ requirements: j.requirements as any, registry: supplierRegistry(), currency: j.currency, fx: { [j.currency]: 1 }, ruleFor: commercialRuleFor }));
}

/**
 * Customer conversation/email/PDF/image/URL → intent → structured requirements →
 * Travel DNA → (optional) live flight inventory → approval-gated journey changes.
 */
export const understandTripRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inputs: z.array(Input).min(1).max(6), journeyId: z.string().uuid().optional(), searchFlights: z.boolean().optional(), assemble: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Db;
    const [{ aiObject, AiUnavailableError }, { toMessages }, intent] = await Promise.all([import("./gateway.server"), import("./sources.server"), import("./intent")]);
    const dna = await loadDna(sb);

    let refs: string[] = [];
    let version = 0;
    if (data.journeyId) {
      const { data: j } = await sb.from("journeys").select("id, current_version").eq("id", data.journeyId).maybeSingle();
      if (!j) throw new Error("Journey not found");
      const { data: v } = await sb.from("journey_versions").select("offers").eq("journey_id", j.id).eq("version", j.current_version).single();
      refs = ((v?.offers ?? []) as { externalId: string }[]).map((o) => o.externalId);
      version = j.current_version;
    }
    const context_ = `Today is ${new Date().toISOString().slice(0, 10)}.${refs.length ? ` Current journey component references: ${refs.join(", ")}.` : ""}`;
    let extracted;
    try {
      extracted = await aiObject(intent.INTENT_SYSTEM, await toMessages(normaliseInputs(data.inputs) as any, context_), intent.IntentSchema);
    } catch (e) {
      if (e instanceof AiUnavailableError) return { ok: false as const, error: e.message };
      throw e;
    }
    if (!extracted) return { ok: false as const, error: "We couldn't understand that request. Please rephrase or add details." };
    // Central safety boundary: no commercial facts, no injected text, refs must match the journey.
    const { guardIntent } = await import("./safety/request-reader");
    const guarded = guardIntent(extracted, refs);
    if (!guarded.intent) return { ok: false as const, error: "We couldn't understand that request. Please rephrase or add details." };
    extracted = guarded.intent;

    const req = intent.toRequirements(extracted, dna as any);
    const plans = intent.planEdits(extracted.edits, refs, version);

    // Approval-gated simulations for directly resolvable edits (persisted, never applied).
    const simulations: Record<string, any>[] = [];
    if (data.journeyId) {
      const svc = await journeyService();
      for (const p of plans) if (p.kind === "simulate") {
        const s = await svc.simulate(data.journeyId, p.change, context.userId);
        simulations.push({ simulationId: s.id, change: p.change, requiresApproval: s.requires_approval, bookableAfter: s.bookable_after, priceDelta: s.price_delta, impacted: s.impacted, newIssues: s.new_issues });
      }
    }

    // Live inventory comes only from the existing engine.
    let flights: Record<string, any> | null = null;
    if (data.searchFlights && req.requirements) {
      const { searchFlightsViaEngine } = await import("@/lib/flights/flight-adapters.server");
      const r = req.requirements;
      flights = (await searchFlightsViaEngine({ origin: r.origin, destination: r.destinations[0]!, depart_date: r.departFrom, return_date: r.returnBy, passengers: r.adults + r.children, cabin: r.luxuryLevel >= 5 ? "business" : "economy" })) as Record<string, any>;
    }

    // Live multi-supplier assembly from AI requirements (deterministic engines decide everything).
    let proposals: Record<string, any> | null = null;
    if (data.assemble && req.requirements) {
      const { assembleAndSave } = await import("@/lib/engine/suppliers/proposals.functions");
      proposals = (await assembleAndSave(context.userId, req.requirements as any, true)) as Record<string, any>;
    }
    // Replacement edits → live search + rebuild (approval-gated simulations).
    const rebuilds: Record<string, any>[] = [];
    if (data.journeyId) {
      const { rebuild } = await import("@/lib/engine/suppliers/proposals.functions");
      for (const p of plans) if (p.kind === "needs_inventory" && p.componentRef)
        rebuilds.push({ componentRef: p.componentRef, ...(await rebuild(data.journeyId, p.componentRef, context.userId)) });
    }

    return {
      ok: true as const,
      proposals,
      rebuilds,
      intent: extracted.intent,
      requirements: req.requirements,
      missing: req.missing,
      problems: req.problems,
      questions: req.questions,
      customerQuestion: extracted.question,
      edits: plans.filter((p) => p.kind !== "simulate"),
      simulations,
      flights,
    };
  });

/** Explain the current journey version. AI wording is rejected if it states unsupported facts. */
export const explainJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ journeyId: z.string().uuid(), simulationId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Db;
    const { data: j } = await sb.from("journeys").select("id, current_version, currency, state").eq("id", data.journeyId).maybeSingle();
    if (!j) throw new Error("Journey not found");
    const { data: v } = await sb.from("journey_versions").select("version, bookable, pricing, issues, graph").eq("journey_id", j.id).eq("version", j.current_version).single();
    const { buildFacts, deterministicExplanation } = await import("./explain");
    let sim = null;
    if (data.simulationId) {
      const r = await sb.from("journey_simulations").select("id, status, price_delta, impacted, material, new_issues, requires_approval, bookable_after").eq("id", data.simulationId).eq("journey_id", j.id).maybeSingle();
      sim = r.data;
    }
    const facts = buildFacts(j, v, sim);
    const fallback = deterministicExplanation(facts);
    const { aiText } = await import("./gateway.server");
    const { verifyNarrative } = await import("@/lib/engine/intelligence/explain");
    try {
      const text = await aiText(
        "You explain Worldway journeys to customers in warm, concise plain English (max 120 words). Use ONLY the facts provided. Do not add any number, price, date, time or supplier that is not in the facts. Never name suppliers.",
        [{ role: "user", content: `Facts:\n${JSON.stringify(facts.display)}` }],
      );
      const check = verifyNarrative(text, facts.allowed);
      return check.ok ? { text, source: "ai" as const, facts: facts.display } : { text: fallback, source: "engine" as const, facts: facts.display, rejected: check.unsupported };
    } catch {
      return { text: fallback, source: "engine" as const, facts: facts.display };
    }
  });
