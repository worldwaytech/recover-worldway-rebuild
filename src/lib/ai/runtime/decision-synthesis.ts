import { isSpecialistCoordinationEnvelope, type SpecialistCoordinationEnvelope } from "./specialist-agents";
import { sanitizeOrchestrationEvidence, type OrchestrationEvidence } from "./orchestration-trace";
import { sanitizeSpecialistAdvisoryOutput } from "./specialist-output-sanitizer";

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
