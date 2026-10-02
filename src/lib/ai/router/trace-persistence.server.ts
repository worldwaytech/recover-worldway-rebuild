import { createClient } from "@supabase/supabase-js";
import type { TraceEvent } from "./telemetry";

type PersistedTrace = {
  request_id: string;
  session_id: string | null;
  actor_id: string | null;
  task: string | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_credits: number | null;
  validation: TraceEvent["validation"] | null;
  fallback: boolean;
  tool_names: string[];
  tool_risks: string[];
  outcome: string | null;
  error_category: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
};

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!URL || !KEY) return null;
  client ??= createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 32);
}

export function traceEventToRow(event: TraceEvent): PersistedTrace {
  const meta = event.meta ?? {};
  const tool = event.tool;
  const risk = event.risk;
  return {
    request_id: event.correlationId,
    session_id: event.sessionId ?? null,
    actor_id: event.actor && /^[0-9a-f-]{36}$/i.test(event.actor) ? event.actor : null,
    task: event.task?.slice(0, 120) ?? null,
    provider: event.provider?.slice(0, 80) ?? null,
    model: event.model?.slice(0, 160) ?? null,
    latency_ms: typeof event.ms === "number" ? Math.max(0, Math.round(event.ms)) : null,
    input_tokens: typeof event.inputTokens === "number" ? Math.max(0, Math.round(event.inputTokens)) : null,
    output_tokens: typeof event.outputTokens === "number" ? Math.max(0, Math.round(event.outputTokens)) : null,
    cost_credits: typeof event.costCredits === "number" && Number.isFinite(event.costCredits) ? Math.max(0, event.costCredits) : null,
    validation: event.validation ?? null,
    fallback: event.fallback === true || event.type === "model.fallback",
    tool_names: tool ? [tool] : [],
    tool_risks: risk ? [risk] : [],
    outcome: event.outcome?.slice(0, 120) ?? null,
    error_category: event.errorCategory?.slice(0, 120) ?? null,
    metadata: meta,
    created_at: event.at,
  };
}

export async function persistTraceEvent(event: TraceEvent): Promise<void> {
  const db = getClient();
  if (!db) return;
  const row = traceEventToRow(event);
  const { error } = await db.from("ai_traces").insert(row);
  if (error) {
    // Observability must never become a dependency of the customer request.
    console.warn("[ww-ai] trace persistence failed:", error.message);
  }
}
