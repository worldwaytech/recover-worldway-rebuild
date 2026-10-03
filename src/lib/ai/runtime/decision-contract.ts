// Typed boundary between advisory model output and deterministic Worldway execution.
// Only bounded, validated decisions with sanitized provenance may cross this boundary.

import { sanitizeOrchestrationEvidence, type OrchestrationEvidence } from "./orchestration-trace";
import { isSpecialistDecisionSynthesisContract, type SpecialistDecisionSynthesisContract } from "./decision-synthesis";

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
  sourceTaskId: string;
  constraints: string[];
  expiresAt: string;
}

export interface DecisionContractValidationOptions {
  expectedCorrelationId: string;
  expectedSourceTaskId: string;
  acceptedDecisionKinds: readonly WorldwayDecisionKind[];
  now?: Date;
}

const MAX_DECISION = 240;
const MAX_CONSTRAINTS = 16;
const MAX_CONSTRAINT = 160;
const DECISION_KINDS: readonly WorldwayDecisionKind[] = [
  "recommendation", "classification", "ranking", "routing", "explanation",
];

export function createWorldwayDecisionContract(input: {
  decisionKind: WorldwayDecisionKind;
  decision: unknown;
  confidence: unknown;
  evidence: unknown;
  correlationId: string;
  sourceTaskId: string;
  constraints?: unknown;
  expiresAt?: unknown;
}): WorldwayDecisionContract | null {
  if (!input.correlationId || typeof input.correlationId !== "string") return null;
  if (!input.sourceTaskId || typeof input.sourceTaskId !== "string") return null;
  if (typeof input.decision !== "string" || !input.decision.trim()) return null;
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) return null;

  const evidence = sanitizeOrchestrationEvidence(input.evidence);
  if (evidence.length === 0) return null;

  const expiresAt = typeof input.expiresAt === "string" && input.expiresAt
    ? input.expiresAt
    : undefined;
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) return null;

  const constraints = Array.isArray(input.constraints)
    ? input.constraints
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .slice(0, MAX_CONSTRAINTS)
        .map((item) => item.trim().slice(0, MAX_CONSTRAINT))
    : [];

  return {
    contractVersion: "1.0",
    decisionKind: input.decisionKind,
    decision: input.decision.trim().slice(0, MAX_DECISION),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    evidence,
    correlationId: input.correlationId,
    sourceTaskId: input.sourceTaskId,
    constraints,
    expiresAt,
  };
}

export function isWorldwayDecisionContract(value: unknown): value is WorldwayDecisionContract {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldwayDecisionContract>;
  const constraints = candidate.constraints;
  return candidate.contractVersion === "1.0"
    && typeof candidate.decisionKind === "string"
    && DECISION_KINDS.includes(candidate.decisionKind as WorldwayDecisionKind)
    && typeof candidate.decision === "string"
    && candidate.decision.trim().length > 0
    && candidate.decision.length <= MAX_DECISION
    && typeof candidate.confidence === "number"
    && Number.isFinite(candidate.confidence)
    && candidate.confidence >= 0
    && candidate.confidence <= 1
    && Array.isArray(candidate.evidence)
    && candidate.evidence.length > 0
    && typeof candidate.correlationId === "string"
    && candidate.correlationId.trim().length > 0
    && typeof candidate.sourceTaskId === "string"
    && candidate.sourceTaskId.trim().length > 0
    && Array.isArray(constraints)
    && constraints.length <= MAX_CONSTRAINTS
    && constraints.every(
      (constraint) =>
        typeof constraint === "string"
        && constraint.trim().length > 0
        && constraint.length <= MAX_CONSTRAINT,
    )
    && typeof candidate.expiresAt === "string"
    && !Number.isNaN(Date.parse(candidate.expiresAt));
}

export function validateWorldwayDecisionContract(
  value: unknown,
  options: DecisionContractValidationOptions,
): WorldwayDecisionContract | null {
  if (!isWorldwayDecisionContract(value)) return null;
  if (value.correlationId !== options.expectedCorrelationId) return null;
  if (value.sourceTaskId !== options.expectedSourceTaskId) return null;
  if (!options.acceptedDecisionKinds.includes(value.decisionKind)) return null;

  const now = options.now ?? new Date();
  if (Date.parse(value.expiresAt) <= now.getTime()) return null;

  const sanitizedEvidence = sanitizeOrchestrationEvidence(value.evidence);
  if (sanitizedEvidence.length !== value.evidence.length) return null;

  for (let index = 0; index < sanitizedEvidence.length; index += 1) {
    const item = sanitizedEvidence[index];
    if (item.expiresAt && Date.parse(item.expiresAt) <= now.getTime()) return null;
    const original = value.evidence[index];
    if (
      item.source !== original.source
      || item.reference !== original.reference
      || item.observedAt !== original.observedAt
      || item.confidence !== original.confidence
      || item.expiresAt !== original.expiresAt
    ) return null;
  }

  return value;
}

export function bindSpecialistSynthesisToDecisionContract(input: {
  synthesis: SpecialistDecisionSynthesisContract;
  decisionKind: WorldwayDecisionKind;
  decision: unknown;
  confidence: unknown;
  correlationId: string;
  sourceTaskId: string;
  acceptedDecisionKinds: readonly WorldwayDecisionKind[];
  constraints?: unknown;
  expiresAt?: unknown;
  now?: Date;
}): WorldwayDecisionContract | null {
  const synthesis = input.synthesis;
  if (!isSpecialistDecisionSynthesisContract(synthesis)) return null;
  if (synthesis.status !== "ready") return null;
  if (synthesis.correlationId !== input.correlationId) return null;
  if (!synthesis.sourceTaskIds.length || synthesis.findings.length !== synthesis.sourceTaskIds.length) return null;
  if (synthesis.conflicts.length > 0 || synthesis.evidence.length === 0) return null;
  if (synthesis.evidenceCoverage.members !== synthesis.findings.length) return null;
  if (synthesis.evidenceCoverage.membersWithEvidence !== synthesis.findings.filter((finding) => finding.evidence.length > 0).length) return null;
  if (!input.acceptedDecisionKinds.includes(input.decisionKind)) return null;

  const contract = createWorldwayDecisionContract({
    decisionKind: input.decisionKind,
    decision: input.decision,
    confidence: input.confidence,
    evidence: synthesis.evidence,
    correlationId: input.correlationId,
    sourceTaskId: input.sourceTaskId,
    constraints: input.constraints,
    expiresAt: input.expiresAt ?? new Date((input.now ?? new Date()).getTime() + 5 * 60_000).toISOString(),
  });
  if (!contract) return null;

  return validateWorldwayDecisionContract(contract, {
    expectedCorrelationId: input.correlationId,
    expectedSourceTaskId: input.sourceTaskId,
    acceptedDecisionKinds: input.acceptedDecisionKinds,
    now: input.now,
  });
}
