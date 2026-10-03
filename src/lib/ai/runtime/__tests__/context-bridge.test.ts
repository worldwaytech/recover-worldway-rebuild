import { describe, expect, it } from "vitest";
import { buildWorldwayOrchestrationContext } from "../context-bridge";
import { EMPTY_TRAVELER_PROFILE, buildPersonalizationContext } from "../../../engine/intelligence/traveler-profile";
import type { KnowledgeSnapshot } from "../../../knowledge/travel-knowledge";

function base() {
  return {
    sessionId: "s1",
    facts: {},
    toolContext: {
      correlationId: "corr-1",
      context: "agent_runtime" as const,
      principal: { permission: "public" as const, scopes: [] },
      highRiskGrant: { tool: "pay_trip", grantedBy: "staff_approval" as const },
    },
  };
}

function knowledge(): KnowledgeSnapshot {
  return {
    generatedAt: "2026-10-03T00:00:00.000Z",
    facts: [{
      id: "dest:ist:season",
      entityType: "destination",
      subjectId: "ist",
      predicate: "season",
      value: "shoulder",
      source: "destination_knowledge",
      sensitivity: "public",
      evidence: {
        source: "destination_knowledge",
        evidence: [],
        observedAt: "2026-10-02T00:00:00.000Z",
        confidence: 0.9,
      },
    }],
    sourceCounts: {
      travel_graph: 0,
      intelligence_observation: 0,
      inventory_offer: 0,
      supplier_evidence: 0,
      destination_knowledge: 1,
      catalogue: 0,
    },
  };
}

describe("Worldway orchestration context bridge", () => {
  it("combines consented memory, current request and evidence-backed knowledge", () => {
    const personalization = buildPersonalizationContext(EMPTY_TRAVELER_PROFILE, { preferences: true, history: true }, []);
    const context = buildWorldwayOrchestrationContext({
      base: base(),
      traveller: {
        travellerId: "traveller-1",
        consent: { preferences: true, history: true },
        profile: EMPTY_TRAVELER_PROFILE,
        personalization,
        memories: [{
          id: "m1",
          kind: "journey",
          key: "trip:1:pace",
          value: { value: "relaxed" },
          confidence: 0.9,
          source: "booking",
          sourceRef: "trip-1",
          expiresAt: null,
          consentScope: "history",
        }],
        activeTrip: {
          tripId: "trip-1",
          status: "planning",
          destinations: ["IST"],
          facts: [{ key: "pace", value: "slow", confidence: 0.7, source: "system_inference", observedAt: "2026-10-02T00:00:00.000Z" }],
          updatedAt: "2026-10-02T00:00:00.000Z",
        },
      },
      currentTripRequest: { tripId: "trip-1", facts: { pace: "fast" } },
      knowledge: knowledge(),
      knowledgeQuery: { subjectId: "ist" },
    });

    expect(context.traveller.memories).toHaveLength(1);
    expect(context.traveller.activeTrip?.facts[0].value).toBe("fast");
    expect(context.knowledge.facts).toHaveLength(1);
    expect(context.knowledge.authority).toBe("advisory_only");
    expect(context.knowledge.executionAuthority).toBe(false);
    expect(Object.isFrozen(context.knowledge)).toBe(true);
    expect(Object.isFrozen(context.knowledge.facts)).toBe(true);
    expect(context.precedence).toBe("current_request_over_memory_over_knowledge");
    expect(context.toolContext.highRiskGrant).toBeUndefined();
  });

  it("filters history memory when consent is disabled", () => {
    const personalization = buildPersonalizationContext(EMPTY_TRAVELER_PROFILE, { preferences: true, history: false }, []);
    const context = buildWorldwayOrchestrationContext({
      base: base(),
      traveller: {
        travellerId: "traveller-2",
        consent: { preferences: true, history: false },
        profile: EMPTY_TRAVELER_PROFILE,
        personalization,
        memories: [{
          id: "m1", kind: "journey", key: "pace", value: { value: "relaxed" },
          confidence: 1, source: "booking", sourceRef: "trip-1", expiresAt: null, consentScope: "history",
        }],
      },
      knowledge: knowledge(),
    });
    expect(context.traveller.memories).toHaveLength(0);
  });
});


describe("Knowledge AI boundary", () => {
  it("bounds Knowledge facts before AI consumption", () => {
    const snapshot = knowledge();
    snapshot.facts = Array.from({ length: 250 }, (_, index) => ({
      ...snapshot.facts[0],
      id: `dest:ist:fact:${index}`,
      predicate: `fact_${index}`,
    }));
    const personalization = buildPersonalizationContext(EMPTY_TRAVELER_PROFILE, { preferences: true, history: true }, []);
    const context = buildWorldwayOrchestrationContext({
      base: base(),
      traveller: {
        travellerId: "traveller-3",
        consent: { preferences: true, history: true },
        profile: EMPTY_TRAVELER_PROFILE,
        personalization,
        memories: [],
      },
      knowledge: snapshot,
    });
    expect(context.knowledge.facts).toHaveLength(200);
    expect(context.knowledge.executionAuthority).toBe(false);
  });
});
