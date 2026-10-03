// Worldway Orchestration Context Bridge.
// Connects the existing Knowledge Layer and Traveller + Trip Memory to the
// Orchestrator without creating a second source of truth or commerce authority.

import type { KnowledgeFact, KnowledgeSnapshot, KnowledgeQuery } from "../../knowledge/travel-knowledge";
import { queryTravelKnowledge } from "../../knowledge/travel-knowledge";
import {
  applyCurrentTripRequest,
  type CurrentTripRequest,
  type TravellerMemoryRecord,
  type TravellerTripContext,
} from "../../engine/intelligence/traveller-trip-memory";
import type { PersonalizationContext, TravelerProfile } from "../../engine/intelligence/traveler-profile";
import type { OrchestrationContext } from "./orchestrator";

export interface OrchestrationContextInput {
  base: Omit<OrchestrationContext, "correlationId">;
  traveller: {
    travellerId: string;
    consent: { preferences: boolean; history: boolean };
    profile: TravelerProfile;
    personalization: PersonalizationContext;
    memories: readonly TravellerMemoryRecord[];
    activeTrip?: TravellerTripContext["activeTrip"];
  };
  currentTripRequest?: CurrentTripRequest;
  knowledge?: KnowledgeSnapshot;
  knowledgeQuery?: KnowledgeQuery;
}

export interface WorldwayOrchestrationContext extends OrchestrationContext {
  traveller: TravellerTripContext;
  knowledge: readonly KnowledgeFact[];
  precedence: "current_request_over_memory_over_knowledge";
}

export function buildWorldwayOrchestrationContext(
  input: OrchestrationContextInput,
): WorldwayOrchestrationContext {
  let traveller: TravellerTripContext = {
    travellerId: input.traveller.travellerId,
    consent: { ...input.traveller.consent },
    profile: input.traveller.profile,
    personalization: input.traveller.personalization,
    memories: input.traveller.memories.filter(
      (memory) => input.traveller.consent[memory.consentScope] === true,
    ),
    activeTrip: input.traveller.activeTrip,
    precedence: "current_request_over_memory",
    generatedAt: new Date().toISOString(),
  };

  if (input.currentTripRequest) {
    traveller = applyCurrentTripRequest(traveller, input.currentTripRequest);
  }

  const knowledge = input.knowledge
    ? queryTravelKnowledge(input.knowledge, input.knowledgeQuery ?? {})
    : [];

  return {
    ...input.base,
    correlationId: input.base.toolContext.correlationId,
    toolContext: {
      ...input.base.toolContext,
      correlationId: input.base.toolContext.correlationId,
      // The bridge can never carry a high-risk grant into orchestration.
      highRiskGrant: undefined,
    },
    traveller,
    knowledge,
    precedence: "current_request_over_memory_over_knowledge",
  };
}
