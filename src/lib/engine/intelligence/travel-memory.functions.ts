import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MemoryKind, MemorySource, recallTravelMemory, rememberTravelMemory, forgetTravelMemory } from "./travel-memory.server";

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
