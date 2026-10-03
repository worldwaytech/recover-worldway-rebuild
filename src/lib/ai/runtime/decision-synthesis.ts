import { isSpecialistCoordinationEnvelope, type SpecialistCoordinationEnvelope } from "./specialist-agents";
import { sanitizeOrchestrationEvidence, type OrchestrationEvidence } from "./orchestration-trace";

export type SpecialistSynthesisStatus = "ready" | "conflicted" | "insufficient_evidence";

export interface SpecialistSynthesisConflict {
  field: "recommendation" | "classification" | "routing";
  values: Array<{ taskId: string; specialist: string; value: string }>;
}

export interface SpecialistSynthesisFinding {
  taskId: string;
  specialist: string;
  output: Record<string, unknown>;
  evidence: OrchestrationEvidence[];
}

export interface SpecialistDecisionSynthesisContract {
  contractVersion: "1.0";
  correlationId: string;
  sourceTaskIds: string[];
  status: SpecialistSynthesisStatus;
  findings: SpecialistSynthesisFinding[];
  conflicts: SpecialistSynthesisConflict[];
  evidence: OrchestrationEvidence[];
  evidenceCoverage: {
    members: number;
    membersWithEvidence: number;
    ratio: number;
  };
}

const SYNTHESIS_FIELDS = ["recommendation", "classification", "routing"] as const;
const MAX_FINDINGS = 10;
const MAX_FINDING_OUTPUT_BYTES = 16_000;
const MAX_ADVISORY_DEPTH = 4;
const MAX_ADVISORY_ARRAY_ITEMS = 32;
const BLOCKED_AUTHORITY_KEYS = new Set([
  "execute", "execution", "executionauthority", "mutate", "mutation",
  "booking", "book", "payment", "pay", "refund", "cancel",
  "suppliermutation", "supplieraction", "tool", "toolcall",
  "credential", "credentials", "secret", "secrets", "highriskgrant",
]);

function advisoryKey(key: string): boolean {
  return !BLOCKED_AUTHORITY_KEYS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function sanitizeAdvisoryValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_ADVISORY_DEPTH) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ADVISORY_ARRAY_ITEMS)
      .map((item) => sanitizeAdvisoryValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!advisoryKey(key)) continue;
    const sanitized = sanitizeAdvisoryValue(item, depth + 1);
    if (sanitized !== undefined) output[key.slice(0, 120)] = sanitized;
  }
  return output;
}

function boundedObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sanitized = sanitizeAdvisoryValue(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return null;
  try {
    const serialized = JSON.stringify(sanitized);
    if (!serialized || serialized.length > MAX_FINDING_OUTPUT_BYTES) return null;
    return sanitized as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validEvidence(evidence: OrchestrationEvidence[], now: Date): OrchestrationEvidence[] | null {
  const sanitized = sanitizeOrchestrationEvidence(evidence);
  if (sanitized.length !== evidence.length) return null;
  for (const item of sanitized) {
    if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) return null;
    if (Number.isNaN(new Date(item.observedAt).getTime())) return null;
  }
  return sanitized;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function synthesizeSpecialistDecisions(
  envelope: SpecialistCoordinationEnvelope,
  options: { expectedCorrelationId?: string; now?: Date } = {},
): SpecialistDecisionSynthesisContract | null {
  const now = options.now ?? new Date();
  if (!isSpecialistCoordinationEnvelope(envelope)) return null;
  if (options.expectedCorrelationId && envelope.correlationId !== options.expectedCorrelationId) return null;
  if (envelope.members.length > MAX_FINDINGS) return null;

  const findings: SpecialistSynthesisFinding[] = [];
  const allEvidence: OrchestrationEvidence[] = [];
  const evidenceKeys = new Set<string>();

  for (const member of envelope.members) {
    const output = boundedObject(member.output);
    if (!output) return null;
    const evidence = validEvidence(member.evidence, now);
    if (!evidence) return null;
    findings.push({ taskId: member.taskId, specialist: member.specialist, output, evidence });
    for (const item of evidence) {
      const key = JSON.stringify([item.source, item.reference, item.observedAt, item.confidence, item.expiresAt ?? null]);
      if (!evidenceKeys.has(key)) {
        evidenceKeys.add(key);
        allEvidence.push(item);
      }
    }
  }

  const conflicts: SpecialistSynthesisConflict[] = [];
  for (const field of SYNTHESIS_FIELDS) {
    const observations = findings
      .map((finding) => {
        const value = stringValue(finding.output[field]);
        return value ? { taskId: finding.taskId, specialist: finding.specialist, value } : null;
      })
      .filter((value): value is { taskId: string; specialist: string; value: string } => Boolean(value));

    const distinct = [...new Set(observations.map((item) => item.value))];
    if (distinct.length > 1) conflicts.push({ field, values: observations });
  }

  const membersWithEvidence = findings.filter((finding) => finding.evidence.length > 0).length;
  const status: SpecialistSynthesisStatus = membersWithEvidence === 0
    ? "insufficient_evidence"
    : conflicts.length > 0
      ? "conflicted"
      : "ready";

  return {
    contractVersion: "1.0",
    correlationId: envelope.correlationId,
    sourceTaskIds: findings.map((finding) => finding.taskId),
    status,
    findings,
    conflicts,
    evidence: sanitizeOrchestrationEvidence(allEvidence),
    evidenceCoverage: {
      members: findings.length,
      membersWithEvidence,
      ratio: membersWithEvidence / findings.length,
    },
  };
}

export function isSpecialistDecisionSynthesisContract(
  value: unknown,
): value is SpecialistDecisionSynthesisContract {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SpecialistDecisionSynthesisContract>;
  return candidate.contractVersion === "1.0"
    && typeof candidate.correlationId === "string"
    && Array.isArray(candidate.sourceTaskIds)
    && Array.isArray(candidate.findings)
    && Array.isArray(candidate.conflicts)
    && ["ready", "conflicted", "insufficient_evidence"].includes(candidate.status ?? "");
}
