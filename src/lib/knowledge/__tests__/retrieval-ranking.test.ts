import { describe, expect, it } from "vitest";
import type { KnowledgeHit } from "../fabric.server";
import { rankKnowledgeHits, scoreKnowledgeHit } from "../retrieval-ranking";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");

function hit(overrides: Partial<KnowledgeHit> = {}): KnowledgeHit {
  return {
    chunkId: "chunk-a",
    documentId: "doc-a",
    title: "Knowledge",
    sourceType: "official",
    canonicalUrl: null,
    trustTier: 3,
    content: "content",
    observedAt: "2026-10-01T12:00:00.000Z",
    validUntil: "2026-10-10T12:00:00.000Z",
    confidence: 0.8,
    provenance: {},
    ...overrides,
  };
}

describe("Knowledge retrieval ranking", () => {
  it("bounds the score to the 0..1 range", () => {
    const score = scoreKnowledgeHit(hit({ confidence: 9, trustTier: 1 }), NOW);
    expect(score.total).toBeLessThanOrEqual(1);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.confidence).toBe(1);
  });

  it("weights confidence before lower-trust evidence", () => {
    const highConfidence = hit({ chunkId: "high", confidence: 0.95, trustTier: 4 });
    const lowConfidence = hit({ chunkId: "low", confidence: 0.6, trustTier: 1 });
    expect(rankKnowledgeHits([lowConfidence, highConfidence], NOW).map((x) => x.chunkId))
      .toEqual(["high", "low"]);
  });

  it("prefers fresher evidence when otherwise equivalent", () => {
    const fresh = hit({ chunkId: "fresh", observedAt: "2026-10-03T10:00:00.000Z" });
    const older = hit({ chunkId: "older", observedAt: "2026-09-25T10:00:00.000Z" });
    expect(rankKnowledgeHits([older, fresh], NOW).map((x) => x.chunkId))
      .toEqual(["fresh", "older"]);
  });

  it("uses chunk id as a stable final tie-breaker", () => {
    const b = hit({ chunkId: "chunk-b" });
    const a = hit({ chunkId: "chunk-a" });
    expect(rankKnowledgeHits([b, a], NOW).map((x) => x.chunkId))
      .toEqual(["chunk-a", "chunk-b"]);
  });

  it("gives non-expiring evidence a neutral freshness score", () => {
    const score = scoreKnowledgeHit(hit({ validUntil: null }), NOW);
    expect(score.freshness).toBe(0.5);
  });
});
