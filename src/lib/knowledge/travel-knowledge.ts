// Worldway Travel Knowledge Layer foundation.
// Post-Phase-16 Upgrade 2: a deterministic, evidence-aware read/ingest boundary
// over existing Phase-16 intelligence and supplier certification evidence.
// This module does not create a competing graph, expose supplier identities to
// clients, or grant commerce authority.

import type {
  EvidenceRef,
  IntelligenceObservation,
  InventoryOffer,
  TravelGraphEdge,
  TravelGraphNode,
} from "../engine/global-travel-intelligence";
import type { SupplierRegistration } from "../engine/types";

export type KnowledgeSource =
  | "travel_graph"
  | "intelligence_observation"
  | "inventory_offer"
  | "supplier_evidence"
  | "destination_knowledge"
  | "catalogue";

export type KnowledgeEntityType =
  | "destination"
  | "supplier_capability"
  | "traveller_context"
  | "experience"
  | "inventory"
  | "route"
  | "policy"
  | "observation";

export interface KnowledgeEvidence {
  source: KnowledgeSource;
  evidence: readonly EvidenceRef[];
  observedAt: string;
  confidence: number;
  expiresAt?: string;
}

export interface KnowledgeFact {
  id: string;
  entityType: KnowledgeEntityType;
  subjectId: string;
  predicate: string;
  value: string | number | boolean | null;
  source: KnowledgeSource;
  evidence: KnowledgeEvidence;
  sensitivity: "public" | "internal";
}

export interface KnowledgeQuery {
  subjectId?: string;
  entityType?: KnowledgeEntityType;
  predicate?: string;
  asOf?: Date;
  minConfidence?: number;
  includeInternal?: boolean;
}

export interface KnowledgeSnapshot {
  generatedAt: string;
  facts: readonly KnowledgeFact[];
  sourceCounts: Readonly<Record<KnowledgeSource, number>>;
}

export interface KnowledgeIngestInput {
  graphNodes?: readonly TravelGraphNode[];
  graphEdges?: readonly TravelGraphEdge[];
  observations?: readonly IntelligenceObservation[];
  inventory?: readonly InventoryOffer[];
  suppliers?: readonly SupplierRegistration[];
  destinationFacts?: readonly KnowledgeFact[];
}

const SOURCE_ORDER: KnowledgeSource[] = [
  "travel_graph",
  "intelligence_observation",
  "inventory_offer",
  "supplier_evidence",
  "destination_knowledge",
  "catalogue",
];

const MAX_FACTS = 10000;
const MAX_ID_LENGTH = 300;
const MAX_PREDICATE_LENGTH = 200;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validateFact(input: KnowledgeFact): KnowledgeFact | null {
  const now = Date.now();
  if (!input.id || input.id.trim().length > MAX_ID_LENGTH) return null;
  if (!input.subjectId || input.subjectId.trim().length > MAX_ID_LENGTH) return null;
  if (!input.predicate || input.predicate.trim().length > MAX_PREDICATE_LENGTH) return null;
  if (!SOURCE_ORDER.includes(input.source)) return null;
  if (!isValidTimestamp(input.evidence.observedAt)) return null;
  const observedAtMs = Date.parse(input.evidence.observedAt);
  if (observedAtMs > now + MAX_FUTURE_SKEW_MS) return null;
  for (const item of input.evidence.evidence) {
    if (!item || !isValidTimestamp(item.observedAt)) return null;
    const itemObservedAt = Date.parse(item.observedAt);
    if (itemObservedAt > now + MAX_FUTURE_SKEW_MS) return null;
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) return null;
    if (item.expiresAt !== undefined && (!isValidTimestamp(item.expiresAt) || Date.parse(item.expiresAt) <= itemObservedAt)) return null;
  }
  if (
    input.evidence.expiresAt !== undefined &&
    (!isValidTimestamp(input.evidence.expiresAt) ||
      Date.parse(input.evidence.expiresAt) <= Date.parse(input.evidence.observedAt))
  ) return null;
  if (
    !Number.isFinite(input.evidence.confidence) ||
    input.evidence.confidence < 0 ||
    input.evidence.confidence > 1
  ) return null;
  if (typeof input.value === "number" && !Number.isFinite(input.value)) return null;
  return {
    ...input,
    id: input.id.trim(),
    subjectId: input.subjectId.trim(),
    predicate: input.predicate.trim(),
  };
}

function evidenceFrom(
  source: KnowledgeSource,
  evidence: readonly EvidenceRef[],
  observedAt: string,
): KnowledgeEvidence {
  const confidence = evidence.length
    ? Math.min(...evidence.map((item) => item.confidence))
    : 0;

  return {
    source,
    evidence,
    observedAt,
    confidence,
    expiresAt: evidence.reduce<string | undefined>((latest, item) => {
      if (!item.expiresAt) return latest;
      return !latest || item.expiresAt < latest ? item.expiresAt : latest;
    }, undefined),
  };
}

function stableId(parts: readonly string[]): string {
  return parts.map((part) => part.trim().toLowerCase()).join(":");
}

function fact(
  id: string,
  entityType: KnowledgeEntityType,
  subjectId: string,
  predicate: string,
  value: KnowledgeFact["value"],
  source: KnowledgeSource,
  evidence: readonly EvidenceRef[],
  observedAt: string,
  sensitivity: KnowledgeFact["sensitivity"] = "internal",
): KnowledgeFact {
  return {
    id,
    entityType,
    subjectId,
    predicate,
    value,
    source,
    evidence: evidenceFrom(source, evidence, observedAt),
    sensitivity,
  };
}

export function ingestTravelKnowledge(input: KnowledgeIngestInput): KnowledgeSnapshot {
  const facts: KnowledgeFact[] = [];

  for (const node of input.graphNodes ?? []) {
    facts.push(
      fact(
        stableId(["graph", node.type, node.id, "canonical"]),
        node.type === "traveller" ? "traveller_context" : node.type === "experience" ? "experience" : node.type === "route" ? "route" : node.type === "destination" ? "destination" : "inventory",
        node.id,
        "canonicalKey",
        node.canonicalKey,
        "travel_graph",
        [],
        new Date().toISOString(),
        node.type === "supplier" ? "internal" : "public",
      ),
    );
  }

  for (const edge of input.graphEdges ?? []) {
    facts.push(
      fact(
        stableId(["edge", edge.id]),
        "policy",
        edge.fromNodeId,
        edge.type,
        edge.toNodeId,
        "travel_graph",
        edge.evidence,
        edge.evidence[0]?.observedAt ?? new Date().toISOString(),
      ),
    );
  }

  for (const observation of input.observations ?? []) {
    for (const [predicate, value] of Object.entries(observation.value)) {
      if (!["string", "number", "boolean"].includes(typeof value) && value !== null) continue;
      facts.push(
        fact(
          stableId(["observation", observation.id, predicate]),
          "observation",
          observation.subjectId,
          predicate,
          value as KnowledgeFact["value"],
          "intelligence_observation",
          observation.evidence,
          observation.capturedAt,
        ),
      );
    }
  }

  for (const offer of input.inventory ?? []) {
    facts.push(
      fact(
        stableId(["offer", offer.id, "price"]),
        "inventory",
        offer.productId,
        "total",
        offer.total,
        "inventory_offer",
        offer.evidence,
        offer.evidence[0]?.observedAt ?? new Date().toISOString(),
      ),
      fact(
        stableId(["offer", offer.id, "availability"]),
        "inventory",
        offer.productId,
        "available",
        offer.available,
        "inventory_offer",
        offer.evidence,
        offer.evidence[0]?.observedAt ?? new Date().toISOString(),
      ),
    );
  }

  for (const supplier of input.suppliers ?? []) {
    for (const grant of supplier.grants ?? []) {
      facts.push(
        fact(
          stableId(["supplier", supplier.supplierKey, grant.capability]),
          "supplier_capability",
          supplier.supplierKey,
          grant.capability,
          grant.certified,
          "supplier_evidence",
          [{
            source: "supplier-registry",
            observedAt: new Date().toISOString(),
            confidence: supplier.reliability,
            reference: grant.evidence,
          }],
          new Date().toISOString(),
          "internal",
        ),
      );
    }
  }

  for (const destinationFact of input.destinationFacts ?? []) {
    const validated = validateFact(destinationFact);
    if (validated) facts.push(validated);
  }

  const deduped = new Map<string, KnowledgeFact>();
  for (const item of facts) {
    const existing = deduped.get(item.id);
    if (!existing || item.evidence.confidence > existing.evidence.confidence) {
      deduped.set(item.id, item);
    }
  }

  return buildSnapshot([...deduped.values()].slice(0, MAX_FACTS));
}

export function queryTravelKnowledge(
  snapshot: KnowledgeSnapshot,
  query: KnowledgeQuery = {},
): KnowledgeFact[] {
  const asOf = query.asOf?.getTime();
  const minConfidence = query.minConfidence ?? 0;
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) return [];
  return snapshot.facts
    .filter((item) => !query.subjectId || item.subjectId === query.subjectId)
    .filter((item) => !query.entityType || item.entityType === query.entityType)
    .filter((item) => !query.predicate || item.predicate === query.predicate)
    .filter((item) => query.includeInternal || item.sensitivity === "public")
    .filter((item) => item.evidence.confidence >= minConfidence)
    .filter((item) => {
      if (!asOf) return true;
      const observed = new Date(item.evidence.observedAt).getTime();
      const expires = item.evidence.expiresAt ? new Date(item.evidence.expiresAt).getTime() : undefined;
      return Number.isFinite(observed) && observed <= asOf && (expires === undefined || expires > asOf);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildSnapshot(facts: KnowledgeFact[]): KnowledgeSnapshot {
  const sourceCounts = Object.fromEntries(SOURCE_ORDER.map((source) => [
    source,
    facts.filter((item) => item.source === source).length,
  ])) as Record<KnowledgeSource, number>;

  return {
    generatedAt: new Date().toISOString(),
    facts: facts.sort((a, b) => a.id.localeCompare(b.id)),
    sourceCounts,
  };
}

export function mergeKnowledgeSnapshots(...snapshots: readonly KnowledgeSnapshot[]): KnowledgeSnapshot {
  const byId = new Map<string, KnowledgeFact>();
  for (const snapshot of snapshots) {
    for (const item of snapshot.facts) {
      const existing = byId.get(item.id);
      if (
        !existing ||
        item.evidence.confidence > existing.evidence.confidence ||
        (
          item.evidence.confidence === existing.evidence.confidence &&
          Date.parse(item.evidence.observedAt) > Date.parse(existing.evidence.observedAt)
        )
      ) byId.set(item.id, item);
    }
  }
  return buildSnapshot([...byId.values()]);
}
