import { recallTravelMemory } from "@/lib/engine/intelligence/travel-memory.server";
import {
  buildPersonalizationContext,
  normalizeTravelerProfile,
  type PersonalizationContext,
  type TravelerProfile,
  applyPersonalizationDefaults,
} from "@/lib/engine/intelligence/traveler-profile";

type Db = { from: (table: string) => any };

export interface TravelAgentContext {
  /** Explicit Travel DNA is authoritative for explicit preferences. */
  explicitPreferences: Record<string, unknown>;
  /** Structured Phase 13 traveler profile, consent-gated. */
  travelerProfile: TravelerProfile;
  /** Deterministic personalization signals derived from consented context. */
  personalization: PersonalizationContext;
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
    consent_scope: "preferences" | "history";
  }>;
  /** The current request always has precedence over remembered preferences. */
  precedence: "current_request_over_memory";
}

export async function buildTravelAgentContext(db: Db, userId: string): Promise<TravelAgentContext> {
  const [{ data: dna }, memories] = await Promise.all([
    db.from("travel_dna")
      .select("consent_preferences, consent_history, preferences")
      .eq("user_id", userId)
      .maybeSingle(),
    recallTravelMemory(db, userId, { limit: 100 }),
  ]);

  const consent = {
    preferences: dna?.consent_preferences === true,
    history: dna?.consent_history === true,
  };
  const travelerProfile = normalizeTravelerProfile(
    dna?.preferences && typeof dna.preferences === "object" ? dna.preferences : {},
  );
  const explicitPreferences = consent.preferences
    ? dna?.preferences && typeof dna.preferences === "object"
      ? dna.preferences as Record<string, unknown>
      : {}
    : {};

  const normalizedMemories = memories.map((m: any) => ({
    id: String(m.id),
    kind: String(m.memory_kind),
    key: String(m.memory_key),
    value: m.value as Record<string, unknown>,
    confidence: Number(m.confidence ?? 1),
    source: String(m.source),
    sourceRef: (m.source_ref ?? m.sourceRef) == null ? null : String(m.source_ref ?? m.sourceRef),
    expiresAt: (m.expires_at ?? m.expiresAt) == null ? null : String(m.expires_at ?? m.expiresAt),
    consent_scope: m.consent_scope as "preferences" | "history",
  }));

  const personalization = buildPersonalizationContext(travelerProfile, consent, normalizedMemories);

  return {
    explicitPreferences,
    travelerProfile,
    personalization,
    memories: normalizedMemories,
    precedence: "current_request_over_memory",
  };
}

/**
 * Applies only safe preference defaults. It never replaces a value explicitly
 * supplied in the current request and never turns memory into commercial truth.
 */
export function applyTravelMemoryDefaults<T extends Record<string, any>>(request: T, context: TravelAgentContext): T {
  const out = applyPersonalizationDefaults({ ...request }, context.personalization);
  const prefs = context.explicitPreferences;
  if (out.luxuryLevel == null && typeof prefs.luxuryLevel === "number") out.luxuryLevel = prefs.luxuryLevel;
  if (out.pace == null && typeof prefs.pace === "string") out.pace = prefs.pace;
  if (out.arrivalRestHours == null && typeof prefs.arrivalRestHours === "number") out.arrivalRestHours = prefs.arrivalRestHours;
  if (out.prefersRefundable == null && typeof prefs.prefersRefundable === "boolean") out.prefersRefundable = prefs.prefersRefundable;
  if (Array.isArray(prefs.interests) && !Array.isArray(out.interests)) out.interests = [...prefs.interests];
  if (Array.isArray(prefs.avoid) && !Array.isArray(out.avoid)) out.avoid = [...prefs.avoid];
  return out as T;
}
