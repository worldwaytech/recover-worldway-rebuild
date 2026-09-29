// Supplier health tracking — pure, in-memory rolling window per supplier.
import type { AdapterOutcome } from "./orchestrator";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface SupplierHealthSnapshot {
  supplierKey: string;
  status: HealthStatus;
  calls: number;
  failures: number;
  errorRate: number;
  p50Ms: number | null;
  lastError?: string;
  lastAt?: string;
}

const WINDOW = 50;

export class HealthTracker {
  private rows = new Map<string, { ok: boolean; ms: number; err?: string; at: string }[]>();

  record(o: AdapterOutcome, at = new Date().toISOString()) {
    if (o.status === "skipped") return;
    const list = this.rows.get(o.supplierKey) ?? [];
    list.push({ ok: o.status !== "failed", ms: o.ms, err: o.status === "failed" ? o.detail : undefined, at });
    this.rows.set(o.supplierKey, list.slice(-WINDOW));
  }

  snapshot(key: string): SupplierHealthSnapshot {
    const list = this.rows.get(key) ?? [];
    if (!list.length) return { supplierKey: key, status: "unknown", calls: 0, failures: 0, errorRate: 0, p50Ms: null };
    const failures = list.filter((r) => !r.ok).length;
    const errorRate = failures / list.length;
    const sorted = list.map((r) => r.ms).sort((a, b) => a - b);
    const lastFail = [...list].reverse().find((r) => !r.ok);
    const recent = list.slice(-3);
    const status: HealthStatus =
      recent.length >= 3 && recent.every((r) => !r.ok) ? "down" : errorRate > 0.2 ? "degraded" : "healthy";
    return {
      supplierKey: key, status, calls: list.length, failures, errorRate,
      p50Ms: sorted[Math.floor(sorted.length / 2)] ?? null,
      lastError: lastFail?.err, lastAt: list[list.length - 1]!.at,
    };
  }

  /** Reliability 0..1 fed back into adapter ranking. */
  reliability(key: string, prior: number): number {
    const s = this.snapshot(key);
    return s.calls ? Math.round((prior * 0.3 + (1 - s.errorRate) * 0.7) * 100) / 100 : prior;
  }
}
