// Explainable recommendations + AI narrative guard. Pure.
// AI may rephrase; every number/time in its text must come from engine facts.
import type { PipelinePackage } from "../package";
import type { Simulation } from "./simulate";

export interface Explanation { headline: string; reasons: string[]; cautions: string[]; facts: string[] }

export function explainPackage(p: PipelinePackage): Explanation {
  const top = [...p.factors].sort((a, b) => b.weight * b.value - a.weight * a.value);
  const facts = [String(p.score), ...(p.pricing ? [p.pricing.total.toFixed(2), p.pricing.currency] : [])];
  return {
    headline: `${p.bookable ? "Bookable" : "Not yet bookable"} journey, score ${p.score}`,
    reasons: top.filter((f) => f.value >= 0.6).map((f) => `${f.factor}: strong`),
    cautions: p.issues.map((i) => i.message),
    facts,
  };
}

export function explainSimulation(s: Simulation): Explanation {
  const facts = s.priceDelta != null ? [s.priceDelta.toFixed(2)] : [];
  return {
    headline: s.requiresApproval ? "This change needs your approval" : "Minor change",
    reasons: [
      ...(s.impacted.length ? [`Affects ${s.impacted.length} later part(s) of the journey`] : []),
      ...(s.material.length ? [`Differs in ${s.material.join(", ")}`] : []),
      ...(s.priceDelta != null ? [`Price change ${s.priceDelta.toFixed(2)}`] : ["Price could not be confirmed"]),
    ],
    cautions: s.newIssues,
    facts,
  };
}

const NUM = /\d+(?:[.,:]\d+)*/g;

/** Reject AI text that states numbers, prices, times or dates not in the facts. */
export function verifyNarrative(text: string, facts: string[]): { ok: boolean; unsupported: string[] } {
  const allowed = new Set(facts.flatMap((f) => f.match(NUM) ?? []));
  const unsupported = (text.match(NUM) ?? []).filter((n) => !allowed.has(n));
  return { ok: unsupported.length === 0, unsupported };
}
