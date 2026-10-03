import type { ComponentKind } from "../../engine/types";
import type { WorldwayDecisionContract } from "./decision-contract";

const ALLOWED = new Set<ComponentKind>([
  "flight", "stay", "activity", "transfer", "rail", "cruise", "aviation",
  "insurance",
]);

export interface WorldwayOrchestrationPreferences {
  preferredKinds?: ComponentKind[];
}

export function projectDecisionContractToOrchestrationPreferences(
  contract: WorldwayDecisionContract,
): WorldwayOrchestrationPreferences {
  if (contract.decisionKind !== "recommendation") {
    throw new Error("decision_contract_not_orchestration_compatible");
  }

  const preferredKinds = new Set<ComponentKind>();
  for (const rawConstraint of contract.constraints) {
    const match = /^orchestration\.prefer\.kind\.([a-z]+)$/.exec(rawConstraint.trim().toLowerCase());
    if (!match) continue;
    const kind = match[1] as ComponentKind;
    if (ALLOWED.has(kind)) preferredKinds.add(kind);
  }

  return preferredKinds.size ? { preferredKinds: [...preferredKinds] } : {};
}
