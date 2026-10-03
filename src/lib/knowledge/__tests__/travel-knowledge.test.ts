import { describe, expect, it } from "vitest";
import {
  ingestTravelKnowledge,
  mergeKnowledgeSnapshots,
  queryTravelKnowledge,
  type KnowledgeSnapshot,
} from "../travel-knowledge";

const evidence = [{ source: "phase16", observedAt: "2026-10-03T00:00:00.000Z", confidence: 0.9 }];

describe("Travel Knowledge Layer foundation", () => {
  it("unifies graph, observation, inventory and supplier evidence", () => {
    const snapshot = ingestTravelKnowledge({
      graphNodes: [
        { id: "dest-1", type: "destination", canonicalKey: "Istanbul", attributes: {} },
        { id: "supplier-1", type: "supplier", canonicalKey: "internal-supplier", attributes: {} },
      ],
      graphEdges: [{
        id: "edge-1", fromNodeId: "dest-1", toNodeId: "supplier-1",
        type: "serves", evidence,
      }],
      observations: [{
        id: "obs-1", kind: "knowledge", subjectId: "dest-1",
        value: { season: "shoulder", score: 0.8 }, evidence,
        capturedAt: "2026-10-03T00:00:00.000Z",
      }],
      inventory: [{
        id: "offer-1", supplierKey: "internal-supplier", productId: "tour-1",
        currency: "EUR", total: 100, available: true,
        priceVersion: "v1", validUntil: "2026-12-01T00:00:00.000Z", evidence,
      }],
      suppliers: [{
        supplierKey: "internal-supplier", kinds: ["activity"], readiness: "production",
        reliability: 0.95, grants: [{
          capability: "search", environment: "production", certified: true, evidence: "certified",
        }],
        capabilities: ["search"],
      }],
    });

    expect(snapshot.sourceCounts.travel_graph).toBe(3);
    expect(snapshot.sourceCounts.intelligence_observation).toBe(2);
    expect(snapshot.sourceCounts.inventory_offer).toBe(2);
    expect(snapshot.sourceCounts.supplier_evidence).toBe(1);

    const publicFacts = queryTravelKnowledge(snapshot, { subjectId: "dest-1", includeInternal: true });
    expect(publicFacts.some((x) => x.predicate === "season" && x.value === "shoulder")).toBe(true);
  });

  it("rejects future-dated externally supplied evidence", () => {
    const snapshot = ingestTravelKnowledge({
      destinationFacts: [{
        id: "future-fact",
        entityType: "destination",
        subjectId: "dest-1",
        predicate: "status",
        value: "future",
        source: "destination_knowledge",
        sensitivity: "public",
        evidence: {
          source: "destination_knowledge",
          evidence: [{ source: "external", observedAt: "2099-01-01T00:00:00.000Z", confidence: 1 }],
          observedAt: "2099-01-01T00:00:00.000Z",
          confidence: 1,
        },
      }],
    });
    expect(snapshot.facts).toHaveLength(0);
  });

  it("filters expired evidence as-of a historical query time", () => {
    const snapshot = ingestTravelKnowledge({
      observations: [{
        id: "obs-expiring", kind: "condition", subjectId: "dest-1",
        value: { weather: "rain" },
        evidence: [{ ...evidence[0], expiresAt: "2026-10-02T00:00:00.000Z" }],
        capturedAt: "2026-10-01T00:00:00.000Z",
      }],
    });
    const current = queryTravelKnowledge(snapshot, { asOf: new Date("2026-10-03T00:00:00.000Z") });
    expect(current).toHaveLength(0);
  });

  it("keeps internal supplier capability evidence out of public queries", () => {
    const snapshot = ingestTravelKnowledge({
      suppliers: [{
        supplierKey: "private-supplier", kinds: ["stay"], readiness: "uat",
        reliability: 0.7, grants: [{
          capability: "book", environment: "uat", certified: false, evidence: "not certified",
        }],
        capabilities: ["book"],
      }],
    });
    expect(queryTravelKnowledge(snapshot)).toHaveLength(0);
    expect(queryTravelKnowledge(snapshot, { includeInternal: true })).toHaveLength(1);
  });

  it("merges snapshots deterministically and keeps stronger evidence", () => {
    const low = ingestTravelKnowledge({
      observations: [{
        id: "same", kind: "knowledge", subjectId: "dest-1",
        value: { score: 0.5 }, evidence: [{ ...evidence[0], confidence: 0.4 }],
        capturedAt: evidence[0].observedAt,
      }],
    });
    const high = ingestTravelKnowledge({
      observations: [{
        id: "same", kind: "knowledge", subjectId: "dest-1",
        value: { score: 0.9 }, evidence: [{ ...evidence[0], confidence: 0.9 }],
        capturedAt: evidence[0].observedAt,
      }],
    });
    const merged = mergeKnowledgeSnapshots(low, high);
    expect(queryTravelKnowledge(merged, { subjectId: "dest-1", predicate: "score", includeInternal: true })[0].value).toBe(0.9);
  });



  it("rejects malformed externally supplied facts instead of poisoning the snapshot", () => {
    const snapshot = ingestTravelKnowledge({
      destinationFacts: [
        {
          id: "bad",
          entityType: "destination",
          subjectId: "dest-1",
          predicate: "confidence",
          value: Number.NaN,
          source: "destination_knowledge",
          sensitivity: "public",
          evidence: {
            source: "destination_knowledge",
            evidence: [],
            observedAt: "not-a-date",
            confidence: 2,
          },
        },
      ],
    });
    expect(snapshot.facts).toHaveLength(0);
  });

  it("fails closed for invalid confidence query thresholds", () => {
    const snapshot = ingestTravelKnowledge({
      destinationFacts: [{
        id: "dest-1:score",
        entityType: "destination",
        subjectId: "dest-1",
        predicate: "score",
        value: 0.8,
        source: "destination_knowledge",
        sensitivity: "public",
        evidence: {
          source: "destination_knowledge",
          evidence: [],
          observedAt: "2026-10-03T00:00:00.000Z",
          confidence: 0.8,
        },
      }],
    });
    expect(queryTravelKnowledge(snapshot, { minConfidence: 2 })).toHaveLength(0);
    expect(queryTravelKnowledge(snapshot, { minConfidence: Number.NaN })).toHaveLength(0);
  });

  it("prefers newer evidence when confidence ties during snapshot merge", () => {
    const older = ingestTravelKnowledge({
      destinationFacts: [{
        id: "dest-1:status",
        entityType: "destination",
        subjectId: "dest-1",
        predicate: "status",
        value: "old",
        source: "destination_knowledge",
        sensitivity: "public",
        evidence: {
          source: "destination_knowledge",
          evidence: [],
          observedAt: "2026-10-01T00:00:00.000Z",
          confidence: 0.9,
        },
      }],
    });
    const newer = ingestTravelKnowledge({
      destinationFacts: [{
        id: "dest-1:status",
        entityType: "destination",
        subjectId: "dest-1",
        predicate: "status",
        value: "new",
        source: "destination_knowledge",
        sensitivity: "public",
        evidence: {
          source: "destination_knowledge",
          evidence: [],
          observedAt: "2026-10-03T00:00:00.000Z",
          confidence: 0.9,
        },
      }],
    });
    expect(queryTravelKnowledge(mergeKnowledgeSnapshots(older, newer), {
      subjectId: "dest-1",
      predicate: "status",
    })[0].value).toBe("new");
  });

  it("returns stable ordering", () => {
    const snapshot: KnowledgeSnapshot = {
      generatedAt: evidence[0].observedAt,
      facts: [
        { id: "z", entityType: "destination", subjectId: "z", predicate: "x", value: true, source: "destination_knowledge", sensitivity: "public", evidence: { source: "destination_knowledge", evidence, observedAt: evidence[0].observedAt, confidence: 0.9 } },
        { id: "a", entityType: "destination", subjectId: "a", predicate: "x", value: true, source: "destination_knowledge", sensitivity: "public", evidence: { source: "destination_knowledge", evidence, observedAt: evidence[0].observedAt, confidence: 0.9 } },
      ],
      sourceCounts: { travel_graph: 0, intelligence_observation: 0, inventory_offer: 0, supplier_evidence: 0, destination_knowledge: 2, catalogue: 0 },
    };
    expect(queryTravelKnowledge(snapshot).map((x) => x.id)).toEqual(["a", "z"]);
  });
});
