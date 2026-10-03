// Worldway Controlled Agentic Commerce.
// Post-Phase-16 Upgrade 5: explicit approval and deterministic high-risk grants.
// This module does not perform bookings or payments. It creates narrowly scoped
// approval state that a deterministic commerce service may consume.

import type { RiskLevel, ToolContext } from "../tools/fabric";

export type ControlledCommerceAction =
  | "HOLD"
  | "BOOK"
  | "PAY"
  | "CANCEL"
  | "REFUND"
  | "MODIFY";

const CONTROLLED_ACTIONS: ReadonlySet<ControlledCommerceAction> = new Set([
  "HOLD", "BOOK", "PAY", "CANCEL", "REFUND", "MODIFY",
]);

export interface CommerceApprovalRequest {
  tool: string;
  action: ControlledCommerceAction;
  quoteId: string;
  idempotencyKey: string;
  principalUserId: string;
  expiresInMs?: number;
}

export interface CommerceApproval {
  id: string;
  tool: string;
  action: ControlledCommerceAction;
  quoteId: string;
  idempotencyKey: string;
  principalUserId: string;
  status: "pending" | "approved" | "consumed" | "expired" | "revoked";
  requestedAt: string;
  expiresAt: string;
  approvedAt?: string;
  consumedAt?: string;
}

export class CommerceApprovalError extends Error {
  constructor(public reason: string) {
    super(`Commerce approval denied: ${reason}`);
  }
}

function riskFor(action: ControlledCommerceAction): RiskLevel {
  return action;
}

function assertNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new CommerceApprovalError(`missing_${field}`);
  return normalized.slice(0, 200);
}

function nowMs(): number {
  return Date.now();
}

export class ControlledCommerceApprovalStore {
  private readonly approvals = new Map<string, CommerceApproval>();
  private readonly idempotency = new Map<string, string>();

  private idempotencyKey(principalUserId: string, key: string): string {
    return JSON.stringify([principalUserId, key]);
  }

  request(input: CommerceApprovalRequest): CommerceApproval {
    if (!CONTROLLED_ACTIONS.has(input.action)) {
      throw new CommerceApprovalError("unsupported_action");
    }

    const tool = assertNonEmpty(input.tool, "tool");
    const quoteId = assertNonEmpty(input.quoteId, "quote_id");
    const idempotencyKey = assertNonEmpty(input.idempotencyKey, "idempotency_key");
    const principalUserId = assertNonEmpty(input.principalUserId, "principal_user_id");
    const scopedIdempotencyKey = this.idempotencyKey(principalUserId, idempotencyKey);
    const existingId = this.idempotency.get(scopedIdempotencyKey);

    if (existingId) {
      const existing = this.approvals.get(existingId);
      if (existing) {
        if (
          existing.tool !== tool ||
          existing.action !== input.action ||
          existing.quoteId !== quoteId
        ) {
          throw new CommerceApprovalError("idempotency_conflict");
        }
        return { ...existing };
      }
    }

    const ttl = Math.max(1_000, Math.min(input.expiresInMs ?? 5 * 60_000, 15 * 60_000));
    const requestedAt = new Date().toISOString();
    const approval: CommerceApproval = {
      id: crypto.randomUUID(),
      tool,
      action: input.action,
      quoteId,
      idempotencyKey,
      principalUserId,
      status: "pending",
      requestedAt,
      expiresAt: new Date(nowMs() + ttl).toISOString(),
    };

    this.approvals.set(approval.id, approval);
    this.idempotency.set(scopedIdempotencyKey, approval.id);
    return { ...approval };
  }

  approve(id: string, principalUserId: string): CommerceApproval {
    const approval = this.requireActive(id);
    if (approval.principalUserId !== principalUserId) {
      throw new CommerceApprovalError("principal_mismatch");
    }
    if (approval.status !== "pending") {
      throw new CommerceApprovalError(`invalid_state:${approval.status}`);
    }

    approval.status = "approved";
    approval.approvedAt = new Date().toISOString();
    return { ...approval };
  }

  revoke(id: string, principalUserId: string): CommerceApproval {
    const approval = this.requireActive(id);
    if (approval.principalUserId !== principalUserId) {
      throw new CommerceApprovalError("principal_mismatch");
    }
    if (approval.status === "consumed") throw new CommerceApprovalError("already_consumed");
    approval.status = "revoked";
    return { ...approval };
  }

  consume(id: string, principalUserId: string): CommerceApproval {
    const approval = this.requireActive(id);
    if (approval.principalUserId !== principalUserId) {
      throw new CommerceApprovalError("principal_mismatch");
    }
    if (approval.status !== "approved") {
      throw new CommerceApprovalError(`approval_required:${approval.status}`);
    }

    approval.status = "consumed";
    approval.consumedAt = new Date().toISOString();
    return { ...approval };
  }

  get(id: string, principalUserId: string): CommerceApproval | undefined {
    const approval = this.approvals.get(id);
    if (!approval) return undefined;
    if (approval.principalUserId !== principalUserId) {
      throw new CommerceApprovalError("principal_mismatch");
    }
    return { ...approval };
  }

  toHighRiskGrant(
    id: string,
    principalUserId: string,
    bookingReadinessValidated: boolean,
  ): ToolContext["highRiskGrant"] {
    const approval = this.requireActive(id);
    if (approval.principalUserId !== principalUserId) {
      throw new CommerceApprovalError("principal_mismatch");
    }
    if (approval.status !== "approved") {
      throw new CommerceApprovalError(`approval_required:${approval.status}`);
    }
    if (!bookingReadinessValidated) {
      throw new CommerceApprovalError("booking_readiness_required");
    }
    return {
      tool: approval.tool,
      action: riskFor(approval.action),
      grantedBy: "booking_readiness",
      principalUserId: approval.principalUserId,
      expiresAt: approval.expiresAt,
    };
  }

  private requireActive(id: string): CommerceApproval {
    const approval = this.approvals.get(id);
    if (!approval) throw new CommerceApprovalError("approval_not_found");

    if (
      (approval.status === "pending" || approval.status === "approved") &&
      new Date(approval.expiresAt).getTime() <= nowMs()
    ) {
      approval.status = "expired";
    }

    return approval;
  }
}

export function assertControlledCommerceAction(action: string): asserts action is ControlledCommerceAction {
  if (!CONTROLLED_ACTIONS.has(action as ControlledCommerceAction)) {
    throw new CommerceApprovalError("unsupported_action");
  }
}

export function assertNoAutonomousCommerce(metadata?: Record<string, string | number | boolean>): void {
  if (metadata?.autonomousBooking === true || metadata?.autonomousPayment === true) {
    throw new CommerceApprovalError("autonomous_commerce_disabled");
  }
}
