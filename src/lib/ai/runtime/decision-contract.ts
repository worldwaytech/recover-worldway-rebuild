// Typed boundary between advisory model output and deterministic Worldway execution.
// Only bounded, validated decisions with sanitized provenance may cross this boundary.

import { sanitizeOrchestrationEvidence, type OrchestrationEvidence } from "./orchestration-trace";

export type WorldwayDecisionKind =
  | "recommendation"
  | "classification"
  | "ranking"
  | "routing"
  | "explanation";

export interface WorldwayDecisionContract {
  contractVersion: "1.0";
  decisionKind: WorldwayDecisionKind;
  decision: string;
  confidence: number;
  evidence: OrchestrationEvidence[];
  correlationId: string;
  constraints: string[];
  expiresAt?: string;
}

const MAX_DECISION = 240;
const MAX_CONSTRAINTS = 16;
const MAX_CONSTRAINT = 160;

export function createWorldwayDecisionContract(input: {
  decisionKind: WorldwayDecisionKind;
  decision: unknown;
  confidence: unknown;
  evidence: unknown;
  correlationId: string;
  constraints?: unknown;
  expiresAt?: unknown;
}): WorldwayDecisionContract | null {
  if (!input.correlationId || typeof input.correlationId !== "string") return null;
  if (typeof input.decision !== "string" || !input.decision.trim()) return null;
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) return null;

  const evidence = sanitizeOrchestrationEvidence(input.evidence);
  if (evidence.length === 0) return null;

  const constraints = Array.isArray(input.constraints)
    ? input.constraints
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .slice(0, MAX_CONSTRAINTS)
        .map((item) => item.trim().slice(0, MAX_CONSTRAINT))
    : [];

  const expiresAt = typeof input.expiresAt === "string" && input.expiresAt ? input.expiresAt : undefined;

  return {
    contractVersion: "1.0",
    decisionKind: input.decisionKind,
    decision: input.decision.trim().slice(0, MAX_DECISION),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    evidence,
    correlationId: input.correlationId,
    constraints,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

export function isWorldwayDecisionContract(value: unknown): value is WorldwayDecisionContract {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldwayDecisionContract>;
  return candidate.contractVersion === "1.0"
    && typeof candidate.decisionKind === "string"
    && typeof candidate.decision === "string"
    && candidate.decision.length > 0
    && typeof candidate.confidence === "number"
    && Array.isArray(candidate.evidence)
    && candidate.evidence.length > 0
    && typeof candidate.correlationId === "string"
    && Array.isArray(candidate.constraints);
}
