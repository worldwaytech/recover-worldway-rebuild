// Deterministic ranking for evidence-backed Knowledge Fabric retrieval.
// Ranking is advisory only. It never grants commerce, supplier, pricing, booking,
// payment, schedule, or mutation authority to a knowledge result.

import type { KnowledgeHit } from "./fabric.server";

export interface KnowledgeRetrievalScore {
  total: number;
  confidence: number;
  trust: number;
  freshness: number;
}

const MAX_SCORE = 1;
const FRESHNESS_NO_EXPIRY = 0.5;

function clamp01(value: number): number {
  return Math.min(MAX_SCORE, Math.max(0, value));
}

/**
 * Scores evidence using only bounded metadata already attached to a hit.
 * Confidence is the strongest signal, followed by source trust and evidence freshness.
 * For expiring evidence, freshness is its remaining proportion of the observed validity
 * window. Non-expiring evidence receives a neutral freshness value rather than an
 * artificial claim of maximum freshness.
 */
export function scoreKnowledgeHit(hit: KnowledgeHit, now = Date.now()): KnowledgeRetrievalScore {
  const confidence = clamp01(Number.isFinite(hit.confidence) ? hit.confidence : 0);
  const trust = clamp01((6 - hit.trustTier) / 5);
  const observedAt = Date.parse(hit.observedAt);
  let freshness = FRESHNESS_NO_EXPIRY;

  if (hit.validUntil) {
    const validUntil = Date.parse(hit.validUntil);
    if (Number.isFinite(observedAt) && Number.isFinite(validUntil) && validUntil > observedAt) {
      freshness = clamp01((validUntil - now) / (validUntil - observedAt));
    } else {
      freshness = 0;
    }
  }

  return {
    total: Number((confidence * 0.5 + trust * 0.3 + freshness * 0.2).toFixed(6)),
    confidence,
    trust,
    freshness,
  };
}

function timestampForTieBreak(hit: KnowledgeHit): number {
  const parsed = Date.parse(hit.observedAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Stable, deterministic ordering. Chunk id is the final immutable tie-breaker. */
export function rankKnowledgeHits(
  hits: readonly KnowledgeHit[],
  now = Date.now(),
): KnowledgeHit[] {
  return hits
    .map((hit) => ({ hit, score: scoreKnowledgeHit(hit, now) }))
    .sort((a, b) =>
      b.score.total - a.score.total ||
      b.score.confidence - a.score.confidence ||
      b.score.trust - a.score.trust ||
      timestampForTieBreak(b.hit) - timestampForTieBreak(a.hit) ||
      a.hit.chunkId.localeCompare(b.hit.chunkId),
    )
    .map(({ hit }) => hit);
}
