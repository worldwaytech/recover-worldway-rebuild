// Persists safe AI trace metadata to public.ai_traces (service role, staff-read RLS).
// Only fields already scrubbed by telemetry.ts are stored — never prompts, secrets,
// payment data or PII. Writes are fire-and-forget and never break an AI call.
import { addTraceSink, type TraceEvent } from "./telemetry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toRow(e: TraceEvent) {
  return {
    request_id: e.correlationId.slice(0, 120),
    session_id: e.sessionId?.slice(0, 120) ?? null,
    actor_id: e.actor && UUID.test(e.actor) ? e.actor : null,
    event_type: e.type,
    task: e.task ?? (typeof e.meta?.["task"] === "string" ? (e.meta["task"] as string) : null),
    provider: e.provider ?? null,
    model: e.model ?? null,
    latency_ms: typeof e.ms === "number" ? Math.round(e.ms) : null,
    input_tokens: e.inputTokens ?? null,
    output_tokens: e.outputTokens ?? null,
    cost_credits: e.costCredits ?? null,
    validation: e.validation ?? null,
    fallback: !!e.fallback,
    tool_name: e.tool ?? null,
    tool_risk: e.risk ?? null,
    outcome: e.outcome ?? null,
    error_category: e.errorCategory ?? null,
    meta: { ...(e.meta ?? {}), ...(e.reason ? { reason: e.reason } : {}) },
    created_at: e.at,
  };
}

let installed = false;

/** Installs the DB sink once per isolate. Disabled in tests and when no service key exists. */
export function installTraceStore() {
  if (installed) return;
  if (process.env["VITEST"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return;
  installed = true;
  addTraceSink((e) => {
    void (async () => {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (supabaseAdmin as any).from("ai_traces").insert(toRow(e));
      } catch { /* telemetry never breaks requests */ }
    })();
  });
}
