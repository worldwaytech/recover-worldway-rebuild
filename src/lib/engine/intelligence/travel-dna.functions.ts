// Customer-controlled Travel DNA (permitted memory). Owner-only via RLS.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Prefs = z.object({
  pace: z.enum(["relaxed", "balanced", "active"]).optional(),
  luxuryLevel: z.number().int().min(1).max(5).optional(),
  interests: z.array(z.string().max(60)).max(30).default([]),
  avoid: z.array(z.string().max(60)).max(30).default([]),
  arrivalRestHours: z.number().min(0).max(24).optional(),
  prefersRefundable: z.boolean().optional(),
});

type Db = { from: (t: string) => any };

export const getTravelDna = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as unknown as Db).from("travel_dna")
      .select("consent_preferences, consent_history, preferences").eq("user_id", context.userId).maybeSingle();
    return data ?? { consent_preferences: false, consent_history: false, preferences: {} };
  });

export const saveTravelDna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ consentPreferences: z.boolean(), consentHistory: z.boolean(), preferences: Prefs }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as Db).from("travel_dna").upsert({
      user_id: context.userId,
      consent_preferences: data.consentPreferences,
      consent_history: data.consentHistory,
      // No consent → nothing is remembered.
      preferences: data.consentPreferences ? data.preferences : {},
    });
    if (error) throw new Error("Could not save travel preferences.");
    return { ok: true };
  });

export const forgetTravelDna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (context.supabase as unknown as Db).from("travel_dna").delete().eq("user_id", context.userId);
    return { ok: true };
  });
