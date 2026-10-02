import { recallTravelMemory } from "@/lib/engine/intelligence/travel-memory.server";

type Db = { from: (table: string) => any };

export interface TravelAgentContext {
  /** Explicit Travel DNA is authoritative for explicit preferences. */
  explicitPreferences: Record<string, unknown>;
  /** Consent-gated memories with provenance, confidence and expiry already enforced. */
  memories: Array<{
    id: string;
    kind: string;
    key: string;
    value: Record<string, unknown>;
    confidence: number;
    source: string;
    sourceRef: string | null;
    expiresAt: string | null;
  }>;
  /** The current request always has precedence over remembered preferences. */
  precedence: "current_request_over_memory";
}

/**
 * Loads only consented customer context for an AI run.
 * Explicit Travel DNA remains the source of truth for explicit preferences.
 */
export async function buildTravelAgentContext(db: Db, userId: string): Promise<TravelAgentContext> {
  const [{ data: dna }, memories] = await Promise.all([
    db.from("travel_dna")
      .select("consent_preferences, consent_history, preferences")
      .eq("user_id", userId)
      .maybeSingle(),
    recallTravelMemory(db, userId, { limit: 50 }),
  ]);

  const explicitPreferences = dna?.consent_preferences === true && dna?.preferences && typeof dna.preferences === "object"
    ? dna.preferences as Record<string, unknown>
    : {};

  return {
    explicitPreferences,
    memories: memories.map((m: any) => ({
      id: String(m.id),
      kind: String(m.memory_kind),
      key: String(m.memory_key),
      value: m.value as Record<string, unknown>,
      confidence: Number(m.confidence ?? 1),
      source: String(m.source),
      sourceRef: m.source_ref == null ? null : String(m.source_ref),
      expiresAt: m.expires_at == null ? null : String(m.expires_at),
    })),
    precedence: "current_request_over_memory",
  };
}

/**
 * Applies only safe preference defaults. It never replaces a value explicitly
 * supplied in the current request and never turns memory into commercial truth.
 */
export function applyTravelMemoryDefaults<T extends Record<string, any>>(request: T, context: TravelAgentContext): T {
  const out = { ...request } as T & Record<string, any>;
  const prefs = context.explicitPreferences;
  if (out.luxuryLevel == null && typeof prefs.luxuryLevel === "number") out.luxuryLevel = prefs.luxuryLevel;
  if (out.pace == null && typeof prefs.pace === "string") out.pace = prefs.pace;
  if (out.arrivalRestHours == null && typeof prefs.arrivalRestHours === "number") out.arrivalRestHours = prefs.arrivalRestHours;
  if (out.prefersRefundable == null && typeof prefs.prefersRefundable === "boolean") out.prefersRefundable = prefs.prefersRefundable;
  if (Array.isArray(prefs.interests) && !Array.isArray(out.interests)) out.interests = [...prefs.interests];
  if (Array.isArray(prefs.avoid) && !Array.isArray(out.avoid)) out.avoid = [...prefs.avoid];
  return out;
}
