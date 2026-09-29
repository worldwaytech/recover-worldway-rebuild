// Supplier-agnostic adapter selection + fan-out with failover.
// Pure: no supplier knowledge. Adapters register capabilities and a health probe.
import type { ComponentKind, SupplierCapability, SupplierRegistration } from "./types";

export interface AdapterHealth {
  configured: boolean;
  healthy: boolean;
  detail?: string;
}

export interface EngineAdapter<Q, R> {
  registration: SupplierRegistration;
  health: () => Promise<AdapterHealth>;
  run: (query: Q) => Promise<R[]>;
}

export interface AdapterOutcome {
  supplierKey: string;
  status: "used" | "empty" | "failed" | "skipped";
  detail?: string;
  count: number;
  ms: number;
}

const READINESS_RANK: Record<string, number> = { production: 0, uat: 1, sandbox: 2, blocked: 9, disabled: 9 };

/** Eligible adapters for a kind+capability, best first. Blocked/disabled never selected. */
export function selectAdapters<A extends { registration: SupplierRegistration }>(
  adapters: A[],
  kind: ComponentKind,
  capability: SupplierCapability,
): A[] {
  return adapters
    .filter((a) => a.registration.kinds.includes(kind))
    .filter((a) => a.registration.capabilities.includes(capability))
    .filter((a) => READINESS_RANK[a.registration.readiness] < 9)
    .sort(
      (a, b) =>
        READINESS_RANK[a.registration.readiness] - READINESS_RANK[b.registration.readiness] ||
        b.registration.reliability - a.registration.reliability,
    );
}

/** Run every eligible, healthy adapter; one failing never blocks the others. */
export async function orchestrate<Q, R>(
  adapters: EngineAdapter<Q, R>[],
  kind: ComponentKind,
  capability: SupplierCapability,
  query: Q,
): Promise<{ results: R[]; outcomes: AdapterOutcome[] }> {
  const eligible = selectAdapters(adapters, kind, capability);
  const outcomes: AdapterOutcome[] = [];
  const settled = await Promise.all(
    eligible.map(async (a) => {
      const started = Date.now();
      const key = a.registration.supplierKey;
      try {
        const h = await a.health();
        if (!h.configured || !h.healthy) {
          outcomes.push({ supplierKey: key, status: "skipped", detail: h.detail, count: 0, ms: Date.now() - started });
          return [] as R[];
        }
        const rows = await a.run(query);
        outcomes.push({ supplierKey: key, status: rows.length ? "used" : "empty", count: rows.length, ms: Date.now() - started });
        return rows;
      } catch (e) {
        outcomes.push({
          supplierKey: key,
          status: "failed",
          detail: e instanceof Error ? e.message : "failed",
          count: 0,
          ms: Date.now() - started,
        });
        return [] as R[];
      }
    }),
  );
  return { results: settled.flat(), outcomes };
}
