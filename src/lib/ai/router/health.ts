// Per-model health, circuit breaker and rate budget (in-memory, per isolate).
import type { FailureKind } from "./types";

export interface BreakerConfig { failureThreshold: number; openMs: number; windowMs: number }
export const DEFAULT_BREAKER: BreakerConfig = { failureThreshold: 3, openMs: 30_000, windowMs: 60_000 };

type State = { failures: number[]; openUntil: number; lastFailure?: FailureKind; calls: number[]; latency: number[]; ok: number; failed: number };

export class HealthBook {
  private s = new Map<string, State>();
  constructor(private cfg: BreakerConfig = DEFAULT_BREAKER, private now: () => number = Date.now) {}

  private get(id: string): State {
    let v = this.s.get(id);
    if (!v) { v = { failures: [], openUntil: 0, calls: [], latency: [], ok: 0, failed: 0 }; this.s.set(id, v); }
    return v;
  }

  isOpen(id: string): boolean { return this.get(id).openUntil > this.now(); }

  /** True when the self-imposed rpm budget is exhausted. */
  overBudget(id: string, rpm: number): boolean {
    const st = this.get(id); const t = this.now();
    st.calls = st.calls.filter((c) => t - c < 60_000);
    return st.calls.length >= rpm;
  }

  start(id: string) { this.get(id).calls.push(this.now()); }

  success(id: string, ms: number) {
    const st = this.get(id); st.ok++; st.failures = []; st.openUntil = 0;
    st.latency.push(ms); if (st.latency.length > 50) st.latency.shift();
  }

  /** Only infrastructure failures trip the breaker; terminal user/account errors don't. */
  failure(id: string, kind: FailureKind) {
    const st = this.get(id); const t = this.now(); st.failed++; st.lastFailure = kind;
    if (kind === "aborted" || kind === "invalid") return;
    st.failures = st.failures.filter((f) => t - f < this.cfg.windowMs);
    st.failures.push(t);
    if (st.failures.length >= this.cfg.failureThreshold) st.openUntil = t + this.cfg.openMs;
  }

  snapshot(id: string) {
    const st = this.get(id);
    const sorted = [...st.latency].sort((a, b) => a - b);
    return { open: this.isOpen(id), ok: st.ok, failed: st.failed, lastFailure: st.lastFailure ?? null, p50Ms: sorted[Math.floor(sorted.length / 2)] ?? null };
  }
}

export const health = new HealthBook();
