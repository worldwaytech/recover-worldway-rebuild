// Explainable ranking of complete packages + booking-readiness gate.
import { checkChronology } from "./chronology";
import type { AuditIssue, NormalizedComponent, SupplierRegistration, TripRequirements } from "./types";

export interface ScoreFactor {
  factor: string;
  weight: number;
  value: number; // 0..1
}

export interface RankedPackage {
  id: string;
  items: NormalizedComponent[];
  score: number;
  factors: ScoreFactor[];
  issues: AuditIssue[];
  bookable: boolean;
}

export function auditPackage(
  items: NormalizedComponent[],
  registry: Map<string, SupplierRegistration>,
): AuditIssue[] {
  const issues = checkChronology(items);
  for (const c of items) {
    const reg = registry.get(c.supplierKey);
    if (!reg || reg.readiness !== "production" || !reg.capabilities.includes("book")) {
      issues.push({ code: "supplier-not-bookable", severity: "warning", componentIds: [c.id], message: `${c.title} is enquiry-only (supplier not production-approved).` });
    }
    if (!c.revalidatedAt) {
      issues.push({ code: "not-revalidated", severity: "warning", componentIds: [c.id], message: `${c.title} has not been revalidated live.` });
    }
  }
  return issues;
}

export function rankPackages(
  candidates: { id: string; items: NormalizedComponent[]; total: number }[],
  req: TripRequirements,
  registry: Map<string, SupplierRegistration>,
): RankedPackage[] {
  const totals = candidates.map((c) => c.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return candidates
    .map((c) => {
      const issues = auditPackage(c.items, registry);
      const errors = issues.filter((i) => i.severity === "error").length;
      const quality = avg(c.items.map((i) => (i.quality ?? 3) / 5));
      const luxuryFit = 1 - Math.abs(quality * 5 - req.luxuryLevel) / 5;
      const price = max === min ? 1 : 1 - (c.total - min) / (max - min);
      const budget = req.budget ? (c.total <= req.budget.amount ? 1 : 0) : 1;
      const flexible = avg(c.items.map((i) => (i.cancellation.refundable ? 1 : 0)));
      const reliability = avg(c.items.map((i) => registry.get(i.supplierKey)?.reliability ?? 0));
      const feasibility = errors === 0 ? 1 : 0;
      const factors: ScoreFactor[] = [
        { factor: "Itinerary feasibility", weight: 0.3, value: feasibility },
        { factor: "Quality / luxury fit", weight: 0.2, value: luxuryFit },
        { factor: "Price", weight: 0.15, value: price },
        { factor: "Within budget", weight: 0.1, value: budget },
        { factor: "Cancellation flexibility", weight: 0.1, value: flexible },
        { factor: "Supplier reliability", weight: 0.15, value: reliability },
      ];
      const score = Math.round(factors.reduce((s, f) => s + f.weight * f.value, 0) * 1000) / 10;
      const bookable = issues.every((i) => i.severity !== "error" && i.code !== "supplier-not-bookable" && i.code !== "not-revalidated");
      return { id: c.id, items: c.items, score, factors, issues, bookable };
    })
    .sort((a, b) => b.score - a.score);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
