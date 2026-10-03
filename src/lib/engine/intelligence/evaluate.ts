// Trip intelligence pipeline over already-assembled, live-revalidated proposals.
// Pure and deterministic: reads only engine results (never invents prices,
// availability or booking status). Order: constraints → evidence/confidence →
// freshness → risks → channel readiness → allowed margin → alternatives.
import type { SupplierRegistration } from "../types";
import type { PipelinePackage } from "../package";
import {
  channelReadiness, componentEvidence, constraints as C, evaluateConstraints,
  packageAlternatives, packageRisks, revalidationDue, type Constraint, type Evidence,
} from "./commerce";
import { optimiseMargin, type MarginResult } from "./margin";
import { toMarginPricedComponents } from "../pricing";

export interface EvaluateInput {
  proposals: { id: string; result: PipelinePackage; bookable: boolean }[];
  registry: Map<string, SupplierRegistration>;
  /** Learned booking success per supplier (0..1). Ranking/confidence only. */
  learned?: Map<string, number>;
  now: string;
  budget?: number;
  prefersRefundable?: boolean;
  passportExpiry?: string;
  /** Approved markup floor as % of the approved markup (100 = no discounting). */
  marginFloorPercent?: number;
}

export interface ProposalIntel {
  proposalId: string;
  label: string | null;
  labelWhy: string | null;
  evidence: Evidence[];
  minConfidence: number;
  risks: ReturnType<typeof packageRisks>;
  channels: ReturnType<typeof channelReadiness>;
  constraints: ReturnType<typeof evaluateConstraints>;
  recheckDue: ReturnType<typeof revalidationDue>;
  margin: MarginResult | null;
  /** True only if the engine said bookable AND no error-level risk AND B2C ready. */
  bookable: boolean;
}

export function buildConstraints(i: Pick<EvaluateInput, "budget" | "prefersRefundable">): Constraint[] {
  const cs: Constraint[] = [];
  if (i.budget) cs.push(C.budget(i.budget, "hard"));
  cs.push(C.refundable(i.prefersRefundable ? "soft" : "preference"));
  return cs;
}

export function evaluateProposals(i: EvaluateInput): ProposalIntel[] {
  const cs = buildConstraints(i);
  const reg = (k: string) => {
    const r = i.registry.get(k);
    const l = i.learned?.get(k);
    return r && l != null ? { ...r, reliability: Math.round(((r.reliability + l) / 2) * 100) / 100 } : r;
  };
  const labels = new Map(packageAlternatives(i.proposals.map((p) => p.result)).map((a) => [a.pkg.id, a]));
  return i.proposals.map((p) => {
    const g = p.result.graph;
    const evidence = g.map((c) => componentEvidence(c, reg(c.supplierKey), i.now));
    const risks = packageRisks(g, { now: i.now, passportExpiry: i.passportExpiry });
    const channels = channelReadiness({ ...p.result, bookable: p.bookable }, evidence);
    const total = p.result.pricing?.total ?? null;
    const constraints = evaluateConstraints(g, total, cs);
    const margin = p.result.pricing ? optimiseMargin(toMarginPricedComponents(p.result.pricing), i.budget ?? null, i.marginFloorPercent ?? 100) : null;
    const lab = labels.get(p.result.id);
    const b2c = channels.find((c) => c.channel === "b2c");
    return {
      proposalId: p.id,
      label: lab?.label ?? null,
      labelWhy: lab?.why ?? null,
      evidence,
      minConfidence: evidence.length ? Math.min(...evidence.map((e) => e.confidence)) : 0,
      risks,
      channels,
      constraints,
      recheckDue: revalidationDue(g, i.now),
      margin,
      bookable: p.bookable && constraints.feasible && !risks.some((r) => r.severity === "error") && !!b2c?.ready,
    };
  });
}
