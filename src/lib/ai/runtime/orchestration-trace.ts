// Worldway orchestration trace/evidence boundary.
// Stores only bounded, opaque provenance references. Never stores task inputs,
// model output, traveller names/emails, credentials, payment data or supplier secrets.

import { emit } from "../router/telemetry";

export interface OrchestrationEvidence {
  source: string;
  reference: string;
  observedAt: string;
  confidence: number;
  expiresAt?: string;
}

export interface OrchestrationTaskTrace {
  taskId: string;
  kind: "tool" | "specialist" | "deterministic" | "model";
  state: "running" | "completed" | "failed" | "blocked" | "cancelled" | "timed_out" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  evidenceCount: number;
}

const OPAQUE_REF = /^[A-Za-z0-9._:-]{1,160}$/;
const MAX_EVIDENCE = 32;
const MAX_SOURCE = 80;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function sanitizeOrchestrationEvidence(input: unknown, now: Date = new Date()): OrchestrationEvidence[] {
  if (!Number.isFinite(now.getTime())) return [];
  if (!Array.isArray(input)) return [];
  const out: OrchestrationEvidence[] = [];
  for (const item of input.slice(0, MAX_EVIDENCE)) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const source = typeof value.source === "string" ? value.source.trim() : "";
    const reference = typeof value.reference === "string" ? value.reference.trim() : "";
    const observedAt = typeof value.observedAt === "string" ? value.observedAt : "";
    const confidence = typeof value.confidence === "number" ? value.confidence : NaN;
    if (!source || !OPAQUE_REF.test(reference) || !Number.isFinite(confidence) || !observedAt) continue;
    const observedMs = Date.parse(observedAt);
    if (!Number.isFinite(observedMs) || observedMs > now.getTime() + MAX_FUTURE_SKEW_MS) continue;
    const expiresAt = typeof value.expiresAt === "string" ? value.expiresAt : undefined;
    if (expiresAt) {
      const expiresMs = Date.parse(expiresAt);
      if (!Number.isFinite(expiresMs) || expiresMs <= observedMs) continue;
    }
    out.push({
      source: source.slice(0, MAX_SOURCE),
      reference,
      observedAt,
      confidence: Math.max(0, Math.min(1, confidence)),
      ...(expiresAt ? { expiresAt } : {}),
    });
  }
  return out;
}

export class OrchestrationTraceCollector {
  private readonly tasks = new Map<string, OrchestrationTaskTrace>();
  private readonly evidence = new Map<string, OrchestrationEvidence[]>();

  constructor(private readonly correlationId: string, private readonly sessionId?: string) {}

  taskStarted(taskId: string, kind: OrchestrationTaskTrace["kind"], startedAt: string) {
    this.tasks.set(taskId, { taskId, kind, state: "running", startedAt, evidenceCount: 0 });
    emit({
      type: "orchestration.task",
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      task: taskId,
      outcome: "started",
      meta: { kind },
    });
  }

  taskFinished(
    taskId: string,
    state: OrchestrationTaskTrace["state"],
    finishedAt: string,
    result?: unknown,
  ) {
    const current = this.tasks.get(taskId);
    if (!current) return;
    const evidence = this.extractEvidence(result);
    this.evidence.set(taskId, evidence);
    this.tasks.set(taskId, {
      ...current,
      state,
      finishedAt,
      evidenceCount: evidence.length,
    });
    emit({
      type: "orchestration.task",
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      task: taskId,
      outcome: state,
      meta: { kind: current.kind, evidenceCount: evidence.length },
    });
    for (const item of evidence) {
      emit({
        type: "orchestration.evidence",
        correlationId: this.correlationId,
        sessionId: this.sessionId,
        task: taskId,
        outcome: "provenance_recorded",
        meta: {
          source: item.source,
          reference: item.reference,
          confidence: item.confidence,
          observedAt: item.observedAt,
          expiresAt: item.expiresAt ?? null,
        },
      });
    }
  }

  snapshot() {
    return {
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      tasks: [...this.tasks.values()],
      evidence: [...this.evidence.entries()].map(([taskId, items]) => ({
        taskId,
        items: items.map((item) => ({ ...item })),
      })),
    };
  }

  private extractEvidence(result: unknown): OrchestrationEvidence[] {
    if (!result || typeof result !== "object") return [];
    const value = result as Record<string, unknown>;
    return sanitizeOrchestrationEvidence(value.evidence);
  }
}
