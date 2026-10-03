import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MemoryKind, MemorySource, recallTravelMemory, rememberTravelMemory, forgetTravelMemory } from "./travel-memory.server";
import { normalizeTravelerProfile, TravelerProfile } from "./traveler-profile";

const Input = z.object({
  kind: MemoryKind,
  key: z.string().min(1).max(120),
  value: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  source: MemorySource,
  sourceRef: z.string().max(240).optional(),
  consentScope: z.enum(["preferences","history"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

const ProfileInput = z.object({
  consentPreferences: z.boolean().optional(),
  consentHistory: z.boolean().optional(),
  profile: TravelerProfile.partial().optional(),
});

export const saveAiTravelMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const row = await rememberTravelMemory(context.supabase as any, context.userId, data);
    return { ok: true, memory: row };
  });

export const getAiTravelMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: MemoryKind.optional(), limit: z.number().int().min(1).max(100).default(50) }).parse(d ?? {}))
  .handler(async ({ data, context }) => ({
    memories: await recallTravelMemory(context.supabase as any, context.userId, data),
  }));

export const forgetAiTravelMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => forgetTravelMemory(context.supabase as any, context.userId, data.id));

export const updateTravelerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const existing = await context.supabase.from("travel_dna")
      .select("consent_preferences, consent_history, preferences")
      .eq("user_id", context.userId)
      .maybeSingle();

    const consentPreferences = data.consentPreferences ?? existing.data?.consent_preferences ?? false;
    const consentHistory = data.consentHistory ?? existing.data?.consent_history ?? false;
    const profile = normalizeTravelerProfile({
      ...(existing.data?.preferences ?? {}),
      ...(data.profile ?? {}),
    });

    const { data: row, error } = await context.supabase.from("travel_dna").upsert({
      user_id: context.userId,
      consent_preferences: consentPreferences,
      consent_history: consentHistory,
      preferences: profile,
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw new Error("Could not update traveler profile.");
    return { ok: true, profile: normalizeTravelerProfile(row?.preferences ?? profile), consent: {
      preferences: consentPreferences,
      history: consentHistory,
    }};
  });
