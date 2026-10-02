// Structured AI audit/trace events. Never carries secrets, payment data or free text PII.

export type TraceEventType =
  | "model.route" | "model.call" | "model.fallback" | "model.failure"
  | "tool.call" | "tool.denied" | "tool.result" | "policy.decision" | "safety.flag" | "authority.violation" | "plan.rejected";

export interface TraceEvent {
  type: TraceEventType;
  correlationId: string;
  sessionId?: string;
  /** Opaque actor id (user uuid / "public" / "system") — never email or name. */
  actor?: string;
  task?: string;
  at: string;
  inputTokens?: number;
  outputTokens?: number;
  costCredits?: number;
  validation?: "passed" | "failed" | "repaired" | "skipped";
  errorCategory?: string;
  fallback?: boolean;
  ms?: number;
  model?: string;
  provider?: string;
  tool?: string;
  risk?: string;
  outcome?: string;
  reason?: string;
  meta?: Record<string, string | number | boolean | null>;
}

const SECRETISH = /(key|secret|token|password|authorization|signature|card|cvv|cvc|pan|upi|email|phone|passport)/i;
const MAX_CORRELATION_ID = 120;
const MAX_REASON = 160;
const MAX_META_KEYS = 24;
const MAX_META_STRING = 80;

/** Drops sensitive-named fields and bounds all free-form trace metadata. */
export function scrubMeta(meta?: Record<string, unknown>): TraceEvent["meta"] {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta).slice(0, MAX_META_KEYS)) {
    if (SECRETISH.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k.slice(0, 80)] = v;
    else if (typeof v === "string") out[k.slice(0, 80)] = v.slice(0, MAX_META_STRING);
  }
  return out;
}

export type TraceSink = (e: TraceEvent) => void;
const sinks = new Set<TraceSink>();
export function addTraceSink(s: TraceSink) { sinks.add(s); return () => sinks.delete(s); }

export function emit(e: Omit<TraceEvent, "at"> & { meta?: Record<string, unknown> }) {
  const ev: TraceEvent = {
    ...e,
    correlationId: e.correlationId.slice(0, MAX_CORRELATION_ID),
    at: new Date().toISOString(),
    meta: scrubMeta(e.meta),
  };
  if (ev.reason) ev.reason = ev.reason.slice(0, MAX_REASON);
  for (const s of sinks) { try { s(ev); } catch { /* sinks never break calls */ } }
  // Structured logs remain metadata-only. Aggregation/retention belongs to the sink.
  console.log(JSON.stringify({ svc: "ww-ai", ...ev }));
}

export function newCorrelationId(): string {
  return `wwai-${crypto.randomUUID()}`;
}
