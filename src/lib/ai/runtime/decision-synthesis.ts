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
function boundedObject(value: unknown): Record<string, unknown> | null {
  return sanitizeSpecialistAdvisoryOutput(value);
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
  if (
    candidate.contractVersion !== "1.0"
    || typeof candidate.correlationId !== "string"
    || !candidate.correlationId.trim()
    || !Array.isArray(candidate.sourceTaskIds)
    || !Array.isArray(candidate.findings)
    || !Array.isArray(candidate.conflicts)
    || !["ready", "conflicted", "insufficient_evidence"].includes(candidate.status ?? "")
    || !candidate.evidence
    || !Array.isArray(candidate.evidence)
    || candidate.evidence.length === 0
    || candidate.evidenceCoverage === undefined
  ) return false;

  if (
    candidate.sourceTaskIds.length === 0
    || candidate.sourceTaskIds.length > MAX_FINDINGS
    || candidate.sourceTaskIds.some((id) => typeof id !== "string" || !id.trim())
    || candidate.findings.length !== candidate.sourceTaskIds.length
    || candidate.conflicts.some((conflict) => {
      if (!conflict || typeof conflict !== "object") return true;
      const item = conflict as Partial<SpecialistSynthesisConflict>;
      return !SYNTHESIS_FIELDS.includes(item.field as typeof SYNTHESIS_FIELDS[number])
        || !Array.isArray(item.values)
        || item.values.length < 2
        || item.values.some((entry) =>
          !entry
          || typeof entry !== "object"
          || typeof entry.taskId !== "string"
          || typeof entry.specialist !== "string"
          || typeof entry.value !== "string"
          || !entry.taskId.trim()
          || !entry.specialist.trim()
          || !entry.value.trim()
        );
    })
  ) return false;

  for (const finding of candidate.findings) {
    if (!finding || typeof finding !== "object") return false;
    const item = finding as Partial<SpecialistSynthesisFinding>;
    if (
      typeof item.taskId !== "string"
      || !item.taskId.trim()
      || typeof item.specialist !== "string"
      || !item.specialist.trim()
      || !item.output
      || typeof item.output !== "object"
      || Array.isArray(item.output)
      || !item.evidence
      || !Array.isArray(item.evidence)
      || !boundedObject(item.output)
    ) return false;
    if (!validEvidence(item.evidence, new Date())) return false;
  }

  const coverage = candidate.evidenceCoverage as SpecialistDecisionSynthesisContract["evidenceCoverage"];
  if (
    !Number.isInteger(coverage.members)
    || !Number.isInteger(coverage.membersWithEvidence)
    || !Number.isFinite(coverage.ratio)
    || coverage.members !== candidate.findings.length
    || coverage.membersWithEvidence < 0
    || coverage.membersWithEvidence > coverage.members
    || coverage.ratio < 0
    || coverage.ratio > 1
    || coverage.ratio !== coverage.membersWithEvidence / coverage.members
  ) return false;

  const aggregateEvidence = validEvidence(candidate.evidence, new Date());
  if (!aggregateEvidence || aggregateEvidence.length === 0) return false;
  if (candidate.status === "insufficient_evidence" && coverage.membersWithEvidence !== 0) return false;
  if (candidate.status === "ready" && (candidate.conflicts.length > 0 || coverage.membersWithEvidence === 0)) return false;
  if (candidate.status === "conflicted" && candidate.conflicts.length === 0) return false;

  return true;
}
