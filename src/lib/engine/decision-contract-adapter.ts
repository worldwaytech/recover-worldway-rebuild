import type { WorldwayDecisionContract } from "../ai/runtime/decision-contract";
import type { RankingProfile, RankingWeights } from "./optimization";

/**
 * Projects a validated AI decision contract into bounded deterministic ranking input.
 * Only explicit ranking hints are accepted. Inventory, price, schedule, readiness and
 * booking remain authoritative in the deterministic engine.
 *
 * Hint format: "ranking.weight.<factor>=<0..1>"
 */
const FACTORS = new Set<keyof RankingWeights>([
  "feasibility", "luxury", "price", "budget", "flexibility",
  "reliability", "geography", "time", "margin", "preference",
]);

export function projectDecisionContractToRankingProfile(
  contract: WorldwayDecisionContract,
): RankingProfile {
  if (contract.decisionKind !== "ranking" && contract.decisionKind !== "recommendation") {
    throw new Error("decision_contract_not_ranking_compatible");
  }

  const weights: Partial<RankingWeights> = {};
  for (const constraint of contract.constraints ?? []) {
    const match = /^ranking\.weight\.([a-z]+)=(0(?:\.\d+)?|1(?:\.0+)?)$/.exec(constraint.trim().toLowerCase());
    if (!match) continue;
    const factor = match[1] as keyof RankingWeights;
    const value = Number(match[2]);
    if (FACTORS.has(factor) && Number.isFinite(value)) weights[factor] = Math.min(1, Math.max(0, value));
  }

  return Object.keys(weights).length ? { weights } : {};
}
