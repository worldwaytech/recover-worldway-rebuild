// Worldway Model Router: capability matching → health/budget → decision, plus
// a bounded fallback runner. Pure except for the injected HealthBook/env.
import { MODELS, POLICIES, hasCapabilities, model, providerConfigured } from "./registry";
import { health as defaultHealth, type HealthBook } from "./health";
import { classifyStatus, isRetryable, type FailureKind, type ModelSpec, type RouteDecision, type TaskKind } from "./types";
import { emit, newCorrelationId } from "./telemetry";
import { allowsAiCostTier, maxAiCostTier } from "./cost-policy";

export class NoRouteError extends Error {
  constructor(public task: TaskKind, public skipped: RouteDecision["skipped"]) { super(`No healthy model for ${task}`); }
}

export interface RouterDeps { health?: HealthBook; env?: Record<string, string | undefined>; models?: ModelSpec[] }

function candidates(task: TaskKind, deps: RouterDeps, includeFallback: boolean) {
  const p = POLICIES[task];
  const ids = includeFallback ? [...p.preferred, ...p.fallback] : p.preferred;
  const find = (id: string) => (deps.models ?? MODELS).find((m) => m.id === id) ?? model(id);
  return ids.map(find).filter((m): m is ModelSpec => !!m);
}

export function route(task: TaskKind, deps: RouterDeps = {}, opts: { exclude?: string[]; correlationId?: string; includeFallback?: boolean } = {}): RouteDecision {
  const h = deps.health ?? defaultHealth;
  const env = deps.env ?? process.env;
  const required = POLICIES[task].required;
  const skipped: RouteDecision["skipped"] = [];
  const correlationId = opts.correlationId ?? newCorrelationId();
  for (const m of candidates(task, deps, opts.includeFallback ?? true)) {
    const why = opts.exclude?.includes(m.id) ? "already_failed"
      : !m.enabled ? "disabled"
      : !hasCapabilities(m, required) ? "missing_capability"
      : !allowsAiCostTier(m.costTier, env) ? "cost_ceiling"
      : !providerConfigured(m.provider, env) ? "not_configured"
      : h.isOpen(m.id) ? "circuit_open"
      : h.overBudget(m.id, m.rpm) ? "over_budget" : null;
    if (why) { skipped.push({ model: m.id, why }); continue; }
    const d: RouteDecision = { correlationId, task, model: m, reason: skipped.length ? "first_healthy_after_skips" : "preferred", skipped };
    emit({ type: "model.route", correlationId, model: m.id, provider: m.provider, reason: d.reason, meta: { task, skipped: skipped.length } });
    return d;
  }
  emit({ type: "model.failure", correlationId, outcome: "no_route", meta: { task, skipped: skipped.length } });
  throw new NoRouteError(task, skipped);
}

export function failureOf(e: unknown): FailureKind {
  const err = e as { status?: number; statusCode?: number; name?: string };
  if (err?.name === "AbortError") return "aborted";
  return classifyStatus(err?.status ?? err?.statusCode);
}

/**
 * Runs `call` on the routed model; on a retryable failure (429/5xx/timeout) it
 * tries the next eligible fallback model once each. Terminal failures (400/402/403…)
 * are rethrown immediately — never retried, never substituted.
 */
export async function withRoute<T>(task: TaskKind, call: (m: ModelSpec, d: RouteDecision) => Promise<T>, deps: RouterDeps = {}, correlationId?: string): Promise<T> {
  const h = deps.health ?? defaultHealth;
  const tried: string[] = [];
  let cid = correlationId;
  for (;;) {
    const d = route(task, deps, { exclude: tried, correlationId: cid });
    cid = d.correlationId;
    const t0 = Date.now();
    h.start(d.model.id);
    try {
      const r = await call(d.model, d);
      const ms = Date.now() - t0;
      h.success(d.model.id, ms);
      emit({ type: "model.call", correlationId: cid, model: d.model.id, provider: d.model.provider, ms, outcome: "ok", meta: { task } });
      return r;
    } catch (e) {
      const kind = failureOf(e);
      h.failure(d.model.id, kind);
      emit({ type: "model.failure", correlationId: cid, task, model: d.model.id, provider: d.model.provider, ms: Date.now() - t0, outcome: "error", errorCategory: kind });
      tried.push(d.model.id);
      if (!isRetryable(kind)) throw e;
      try { route(task, deps, { exclude: tried, correlationId: cid }); } catch { throw e; }
      emit({ type: "model.fallback", correlationId: cid, task, model: d.model.id, reason: kind, fallback: true });
    }
  }
}

export function routerStatus(deps: RouterDeps = {}) {
  const h = deps.health ?? defaultHealth;
  const env = deps.env ?? process.env;
  return (deps.models ?? MODELS).map((m) => ({ id: m.id, provider: m.provider, enabled: m.enabled, configured: providerConfigured(m.provider, env), capabilities: m.capabilities, costTier: m.costTier, maxCostTier: maxAiCostTier(env), allowedByCostCeiling: allowsAiCostTier(m.costTier, env), latencyMs: m.latencyMs, rpm: m.rpm, health: h.snapshot(m.id) }));
}

/** Human-readable routing explanation (admin/debug). */
export function explainRoute(d: RouteDecision): string {
  const skipped = d.skipped.map((s) => `${s.model} (${s.why})`).join(", ");
  return `Task ${d.task} → ${d.model.id} on ${d.model.provider}: ${d.reason}${skipped ? `; skipped ${skipped}` : ""}.`;
}

/** Structured-output validation at the router boundary; records the result in the trace. */
export function validateStructured<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, value: unknown, correlationId: string, task: TaskKind): T | null {
  const r = schema.safeParse(value);
  emit({ type: "model.call", correlationId, task, validation: r.success ? "passed" : "failed", outcome: r.success ? "valid_output" : "invalid_output" });
  return r.success ? r.data : null;
}
