// Worldway Model Router — shared, pure types (no secrets, no I/O).

export type ProviderId = "lovable" | "aethercore" | "google" | "openai";
export type ModelCapability = "chat" | "tools" | "structured" | "reasoning" | "vision" | "pdf" | "voice" | "agent";
export type TaskKind = "intent_extraction" | "explanation" | "concierge_chat" | "concierge_voice" | "document_ingest";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  /** Env var names required (names only — values never read into telemetry). */
  requiredEnv: string[];
  /** Data never leaves for providers that retain data unless explicitly allowed. */
  zeroRetention: boolean;
}

export interface ModelSpec {
  id: string; // exact gateway/provider model id
  provider: ProviderId;
  capabilities: ModelCapability[];
  /** Relative cost tier 1 (cheap) .. 5 (expensive) — routing metadata only. */
  costTier: number;
  /** Expected p50 latency (ms) — routing metadata only. */
  latencyMs: number;
  /** Requests per minute budget the router will self-limit to. */
  rpm: number;
  enabled: boolean;
}

export interface RoutingPolicy {
  task: TaskKind;
  required: ModelCapability[];
  /** Ordered preference; first healthy & capable wins. */
  preferred: string[];
  /** Fallback models tried only on retryable failures (429/5xx/timeout). */
  fallback: string[];
}

export type FailureKind = "rate_limited" | "server" | "timeout" | "credits" | "denied" | "invalid" | "not_configured" | "aborted" | "unknown";

export interface RouteDecision {
  correlationId: string;
  task: TaskKind;
  model: ModelSpec;
  reason: string;
  skipped: { model: string; why: string }[];
}

/** Only 429/5xx/timeout are retryable (gateway error semantics). Everything else is terminal. */
export function isRetryable(kind: FailureKind): boolean {
  return kind === "rate_limited" || kind === "server" || kind === "timeout";
}

export function classifyStatus(status?: number, aborted = false): FailureKind {
  if (aborted || status === 499) return "aborted";
  if (status === 429) return "rate_limited";
  if (status === 402) return "credits";
  if (status === 403) return "denied";
  if (status === 401) return "not_configured";
  if (status === 400 || status === 404) return "invalid";
  if (status && status >= 500) return "server";
  return "unknown";
}
