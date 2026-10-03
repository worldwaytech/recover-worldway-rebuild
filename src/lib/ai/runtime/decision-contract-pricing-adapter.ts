import type { WorldwayDecisionContract } from "./decision-contract";

const SIGNALS = new Set(["demandIndex", "inventoryPressure", "conversionIndex"]);
const LEAD_TIME_MAX_DAYS = 365;

export interface WorldwayPricingSignals {
  demandIndex?: number;
  inventoryPressure?: number;
  conversionIndex?: number;
  leadTimeDays?: number;
}

/**
 * Projects only explicit, bounded model recommendations into deterministic
 * pricing signals. The pricing policy remains authoritative for the final quote.
 */
export function projectDecisionContractToPricingSignals(
  contract: WorldwayDecisionContract,
): WorldwayPricingSignals {
  if (contract.decisionKind !== "recommendation") {
    throw new Error("decision_contract_not_pricing_compatible");
  }

  const signals: WorldwayPricingSignals = {};
  for (const rawConstraint of contract.constraints) {
    const match = /^pricing\.signal\.([A-Za-z]+)=([0-9]+(?:\.[0-9]+)?)$/.exec(rawConstraint.trim());
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;

    if (SIGNALS.has(key)) {
      if (value < 0 || value > 1) continue;
      signals[key as "demandIndex" | "inventoryPressure" | "conversionIndex"] = value;
      continue;
    }

    if (key === "leadTimeDays") {
      if (value < 0 || value > LEAD_TIME_MAX_DAYS) continue;
      signals.leadTimeDays = value;
    }
  }

  return signals;
}
