import type { BookingStatus } from "../../engine/booking-orchestration";
import {
  postBookingModificationReadiness,
  type BookingComponent,
} from "../../engine/booking-orchestration";
import type { SupplierCapability } from "../../engine/types";
import type { WorldwayDecisionContract } from "./decision-contract";

export type WorldwayModificationField = "date" | "time" | "passengerCount" | "notes";

export interface WorldwayModificationIntent {
  bookingId: string;
  componentIds: string[];
  changes: Partial<Record<WorldwayModificationField, string | number>>;
  readiness: ReturnType<typeof postBookingModificationReadiness>;
  requiresApproval: true;
  requiresRevalidation: true;
  requiresCommercialRequote: true;
}

/**
 * Projects a validated AI decision into a narrow, supplier-agnostic
 * post-booking modification intent.
 *
 * The AI cannot supply supplier payloads, prices, fees, refunds, provider
 * references, capability claims, or execution authority. The deterministic
 * booking engine decides whether the current booking/components are eligible.
 */
export function projectDecisionContractToPostBookingModification(
  contract: WorldwayDecisionContract,
  input: {
    bookingId: string;
    bookingStatus: BookingStatus;
    components: readonly BookingComponent[];
    capabilities: ReadonlyMap<string, readonly SupplierCapability[]>;
  },
): WorldwayModificationIntent {
  if (contract.decisionKind !== "recommendation") {
    throw new Error("decision_contract_not_post_booking_modification_compatible");
  }

  const componentIds = new Set<string>();
  const changes: Partial<Record<WorldwayModificationField, string | number>> = {};

  for (const rawConstraint of contract.constraints) {
    const constraint = rawConstraint.trim();

    const componentMatch = /^postbooking\.modification\.component=([A-Za-z0-9._:-]+)$/.exec(constraint);
    if (componentMatch) {
      componentIds.add(componentMatch[1]!);
      continue;
    }

    const dateMatch = /^postbooking\.modification\.date=(\\d{4}-\\d{2}-\\d{2})$/.exec(constraint);
    if (dateMatch) {
      changes.date = dateMatch[1]!;
      continue;
    }

    const timeMatch = /^postbooking\.modification\.time=(\\d{2}:\\d{2})$/.exec(constraint);
    if (timeMatch) {
      changes.time = timeMatch[1]!;
      continue;
    }

    const passengerMatch = /^postbooking\.modification\.passengerCount=(\\d{1,2})$/.exec(constraint);
    if (passengerMatch) {
      const value = Number(passengerMatch[1]);
      if (value >= 1 && value <= 20) changes.passengerCount = value;
      continue;
    }

    const notesMatch = /^postbooking\.modification\.notes=([^\\n]{1,500})$/.exec(constraint);
    if (notesMatch) {
      changes.notes = notesMatch[1]!;
    }
  }

  const selectedIds = componentIds.size
    ? [...componentIds].filter((id) => input.components.some((component) => component.id === id))
    : input.components.map((component) => component.id);

  const readiness = postBookingModificationReadiness(
    input.bookingStatus,
    input.components,
    input.capabilities,
    selectedIds,
  );

  return {
    bookingId: input.bookingId,
    componentIds: selectedIds,
    changes,
    readiness,
    requiresApproval: true,
    requiresRevalidation: true,
    requiresCommercialRequote: true,
  };
}
