import type { WorldwayDecisionContract } from "./decision-contract";
import { bookingReadiness } from "../../engine/booking-orchestration";
import type { NormalizedComponent, SupplierCapability } from "../../engine/types";

export interface WorldwayBookingReadinessRequest {
  check: boolean;
}

export interface WorldwayBookingReadinessProjection {
  request: WorldwayBookingReadinessRequest;
  readiness?: ReturnType<typeof bookingReadiness>;
}

/**
 * Project a validated decision contract into a read-only booking-readiness check.
 * The AI cannot assert readiness, supplier capability, availability, payment state,
 * or booking authority. The deterministic booking engine remains authoritative.
 */
export function projectDecisionContractToBookingReadiness(
  contract: WorldwayDecisionContract,
  components: readonly NormalizedComponent[],
  capabilities: ReadonlyMap<string, readonly SupplierCapability[]>,
): WorldwayBookingReadinessProjection {
  if (contract.decisionKind !== "recommendation") {
    throw new Error("booking_readiness_projection_requires_recommendation");
  }

  return {
    request: { check: true },
    readiness: bookingReadiness(components, capabilities),
  };
}
