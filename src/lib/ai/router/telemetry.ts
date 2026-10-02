// Structured AI audit/trace events. Never carries secrets, payment data or free text PII.

export type TraceEventType =
  | "model.route" | "model.call" | "model.fallback" | "model.failure"
  | "tool.call" | "tool.denied" | "tool.result" | "policy.decision" | "safety.flag" | "authority.violation" | "plan.rejected";

export interface TraceEvent {
  type: TraceEventType;
  correlationId: string;
  at: string;
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

/** Drops sensitive-named fields and truncates strings so traces can't leak data. */
export function scrubMeta(meta?: Record<string, unknown>): TraceEvent["meta"] {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRETISH.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
  }
  return out;
}

export type TraceSink = (e: TraceEvent) => void;
const sinks = new Set<TraceSink>();
export function addTraceSink(s: TraceSink) { sinks.add(s); return () => sinks.delete(s); }

export function emit(e: Omit<TraceEvent, "at"> & { meta?: Record<string, unknown> }) {
  const ev: TraceEvent = { ...e, at: new Date().toISOString(), meta: scrubMeta(e.meta) };
  if (ev.reason) ev.reason = ev.reason.slice(0, 160);
  for (const s of sinks) { try { s(ev); } catch { /* sinks never break calls */ } }
  console.log(JSON.stringify({ svc: "ww-ai", ...ev }));
}

export function newCorrelationId(): string {
  return `wwai-${crypto.randomUUID()}`;
}
