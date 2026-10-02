import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MemoryKind = z.enum(["explicit","behavioral","journey","inferred","session"]);
export const MemorySource = z.enum(["user","booking","interaction","system_inference"]);

const MemoryValue = z.record(z.string(), z.unknown());

const BLOCKED = /\b(password|api[_ -]?key|secret|authorization|credit[_ -]?card|card[_ -]?number|cvv|cvc|upi|passport[_ -]?number|health|medical|diagnosis|religion|political|politics|sexual orientation|sex life)\b/i;

function assertSafeMemory(key: string, value: unknown) {
  const serialized = JSON.stringify({ key, value });
  if (BLOCKED.test(serialized)) throw new Error("memory_contains_disallowed_sensitive_data");
  if (serialized.length > 8000) throw new Error("memory_value_too_large");
}

type Db = { from: (table: string) => any };

async function consentFor(db: Db, userId: string, scope: "preferences" | "history") {
  const { data } = await db.from("travel_dna")
    .select("consent_preferences, consent_history")
    .eq("user_id", userId)
    .maybeSingle();
  return scope === "preferences" ? data?.consent_preferences === true : data?.consent_history === true;
}

export const rememberTravelMemory = async (
  db: Db,
  userId: string,
  input: {
    kind: z.infer<typeof MemoryKind>;
    key: string;
    value: z.infer<typeof MemoryValue>;
    confidence?: number;
    source: z.infer<typeof MemorySource>;
    sourceRef?: string;
    consentScope: "preferences" | "history";
    expiresAt?: string | null;
  },
) => {
  assertSafeMemory(input.key, input.value);
  if (!(await consentFor(db, userId, input.consentScope))) {
    throw new Error("memory_consent_required");
  }
  if (input.kind === "session") throw new Error("session_memory_is_not_persistent");
  if (input.kind === "inferred" && input.source !== "system_inference") {
    throw new Error("inferred_memory_requires_system_source");
  }

  const { data, error } = await db.from("travel_memory").upsert({
    user_id: userId,
    memory_kind: input.kind,
    memory_key: input.key.slice(0, 120),
    value: input.value,
    confidence: input.confidence ?? (input.kind === "inferred" ? 0.6 : 1),
    source: input.source,
    source_ref: input.sourceRef?.slice(0, 240) ?? null,
    consent_scope: input.consentScope,
    expires_at: input.expiresAt ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,memory_kind,memory_key" }).select().single();

  if (error) throw new Error("Could not save travel memory.");
  return data;
};

export const recallTravelMemory = async (
  db: Db,
  userId: string,
  options: { kind?: z.infer<typeof MemoryKind>; limit?: number } = {},
) => {
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  let q = db.from("travel_memory")
    .select("id,memory_kind,memory_key,value,confidence,source,source_ref,expires_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options.kind) q = q.eq("memory_kind", options.kind);

  const { data, error } = await q;
  if (error) throw new Error("Could not load travel memory.");

  const now = Date.now();
  return (data ?? []).filter((m: { expires_at: string | null }) => !m.expires_at || Date.parse(m.expires_at) > now);
};

export const forgetTravelMemory = async (db: Db, userId: string, id: string) => {
  const { error } = await db.from("travel_memory").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error("Could not forget travel memory.");
  return { ok: true };
};
