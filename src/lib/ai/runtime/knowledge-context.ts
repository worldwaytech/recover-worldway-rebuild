import type { KnowledgeFact, KnowledgeSnapshot, KnowledgeQuery } from "../../knowledge/travel-knowledge";
import { queryTravelKnowledge } from "../../knowledge/travel-knowledge";

const MAX_AI_KNOWLEDGE_FACTS = 200;

export interface WorldwayKnowledgeContext {
  readonly contractVersion: "1.0";
  readonly generatedAt: string;
  readonly facts: readonly KnowledgeFact[];
  readonly sourceCounts: KnowledgeSnapshot["sourceCounts"];
  readonly query: KnowledgeQuery;
  readonly authority: "advisory_only";
  readonly executionAuthority: false;
}

function readonlyFact(fact: KnowledgeFact): KnowledgeFact {
  const evidence = Object.freeze({
    ...fact.evidence,
    evidence: Object.freeze([...fact.evidence.evidence]),
  });
  return Object.freeze({ ...fact, evidence });
}

/**
 * Projects the deterministic Knowledge Layer into a bounded, read-only AI context.
 * This context can inform planning, analysis and recommendations only. It carries
 * no booking, payment, pricing, supplier mutation or other execution authority.
 */
export function buildWorldwayKnowledgeContext(
  snapshot: KnowledgeSnapshot | undefined,
  query: KnowledgeQuery = {},
): WorldwayKnowledgeContext {
  const facts = snapshot
    ? queryTravelKnowledge(snapshot, query).slice(0, MAX_AI_KNOWLEDGE_FACTS).map(readonlyFact)
    : [];

  return Object.freeze({
    contractVersion: "1.0" as const,
    generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
    facts: Object.freeze(facts),
    sourceCounts: Object.freeze({ ...(snapshot?.sourceCounts ?? {
      travel_graph: 0,
      intelligence_observation: 0,
      inventory_offer: 0,
      supplier_evidence: 0,
      destination_knowledge: 0,
      catalogue: 0,
    }) }),
    query: Object.freeze({ ...query }),
    authority: "advisory_only" as const,
    executionAuthority: false as const,
  });
}
