// Minimal staff-only AI trace read service. RLS (is_staff) enforces access; the
// explicit check gives a clear error and keeps non-staff from even querying.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COLS = "id, request_id, session_id, event_type, task, provider, model, latency_ms, input_tokens, output_tokens, cost_credits, validation, fallback, tool_name, tool_risk, outcome, error_category, created_at";

export const listAiTraces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    requestId: z.string().max(120).optional(),
    task: z.string().max(60).optional(),
    onlyFailures: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: staff } = await sb.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden");
    let q = sb.from("ai_traces").select(COLS).order("created_at", { ascending: false }).limit(data.limit);
    if (data.requestId) q = q.eq("request_id", data.requestId);
    if (data.task) q = q.eq("task", data.task);
    if (data.onlyFailures) q = q.in("event_type", ["model.failure", "tool.denied", "plan.rejected", "safety.flag", "authority.violation"]);
    const { data: rows, error } = await q;
    if (error) throw new Error("Could not load AI traces");
    return { traces: rows ?? [] };
  });

export const aiTraceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: staff } = await sb.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows } = await sb.from("ai_traces").select("event_type, model, latency_ms, fallback, error_category").gte("created_at", since).limit(5000);
    const r = (rows ?? []) as { event_type: string; model: string | null; latency_ms: number | null; fallback: boolean; error_category: string | null }[];
    const calls = r.filter((x) => x.event_type === "model.call" && x.latency_ms != null);
    const lat = calls.map((x) => x.latency_ms!).sort((a, b) => a - b);
    return {
      windowHours: 24,
      modelCalls: calls.length,
      failures: r.filter((x) => x.event_type === "model.failure").length,
      fallbacks: r.filter((x) => x.fallback).length,
      toolDenials: r.filter((x) => x.event_type === "tool.denied").length,
      planRejections: r.filter((x) => x.event_type === "plan.rejected").length,
      p50LatencyMs: lat[Math.floor(lat.length / 2)] ?? null,
      errorCategories: Object.fromEntries([...new Set(r.map((x) => x.error_category).filter(Boolean))].map((k) => [k, r.filter((x) => x.error_category === k).length])),
    };
  });
