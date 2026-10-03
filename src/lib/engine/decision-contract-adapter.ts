import type { WorldwayDecisionContract } from "../ai/runtime/decision-contract";
import type { RankingProfile } from "./optimization";

/**
 * Projects a validated AI decision contract into bounded deterministic engine inputs.
 * The engine remains authoritative for inventory, price, schedule, readiness and booking.
 */
export function projectDecisionContractToRankingProfile(
  contract: WorldwayDecisionContract,
): RankingProfile {
  if (contract.decisionKind !== "ranking" && contract.decisionKind !== "recommendation") {
    throw new Error("decision_contract_not_ranking_compatible");
  }

  const text = contract.decision.trim().toLowerCase();
  const weights: RankingProfile["weights"] = {};

  if (/luxury|premium|high.?end/.test(text)) weights.luxury = 0.25;
  if (/price|value|budget|affordable/.test(text)) weights.price = 0.25;
  if (/reliable|reliability|trusted/.test(text)) weights.reliability = 0.25;
  if (/flexib/.test(text)) weights.flexibility = 0.25;
  if (/time|fast|shorter/.test(text)) weights.time = 0.25;

  if (!Object.keys(weights).length) return {};
  return { weights };
}
