/**
 * Payment persistence helpers — server only.
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

export type PaymentRow = {
  id: string;
  user_id: string | null;
  purpose: string;
  plan_id: string | null;
  order_id: string;
  payment_id: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  verified_at?: string | null;
  fulfilled_at?: string | null;
  fulfilment_reference?: string | null;
};


type DbError = { message: string } | null;

/**
 * Structural view of the `payments` table used by this module. The generated
 * Supabase types are regenerated asynchronously, so the table is accessed
 * through this narrow shape rather than the generated union.
 */
type PaymentsTable = {
  insert: (values: Record<string, unknown>) => Promise<{ error: DbError }>;
  select: (columns: string) => {
    eq: (
      column: string,
      value: string,
    ) => { maybeSingle: () => Promise<{ data: unknown; error: DbError }> };
  };
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<{ error: DbError }>;
  };
};

async function paymentsTable(): Promise<PaymentsTable> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.from as unknown as (table: string) => PaymentsTable)("payments");
}

/** Resolve the signed-in user from the bearer token when one is present; never throws. */
export async function optionalUserId(): Promise<string | null> {
  try {
    const header = getRequestHeader("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return null;

    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
    if (!url || !key) return null;

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function insertPaymentRecord(row: {
  user_id: string | null;
  purpose: string;
  plan_id: string | null;
  order_id: string;
  amount_minor: number;
  currency: string;
  description: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  reference: Record<string, unknown>;
}): Promise<void> {
  const table = await paymentsTable();
  const { error } = await table.insert({ ...row, status: "created" });
  if (error) {
    console.error("[payments] insert failed", error.message);
    throw new Error("Could not open a payment record. Please try again.");
  }
}

export async function getPaymentByOrderId(orderId: string): Promise<PaymentRow | null> {
  const table = await paymentsTable();
  const { data, error } = await table
    .select("id, user_id, purpose, plan_id, order_id, payment_id, amount_minor, currency, status, verified_at, fulfilled_at, fulfilment_reference")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[payments] lookup failed", error.message);
    return null;
  }
  return (data as PaymentRow | null) ?? null;
}

export async function markPaymentStatus(input: {
  orderId: string;
  status: string;
  paymentId?: string | null;
  failureReason?: string | null;
  providerPayload?: Record<string, unknown> | null;
  verified?: boolean;
}): Promise<void> {
  // Idempotent reconciliation: a settled payment is terminal. Duplicate or
  // out-of-order webhook retries must never move it back to failed/pending.
  const existing = await getPaymentByOrderId(input.orderId);
  if (existing?.status === "paid" && input.status !== "paid") {
    return;
  }

  const table = await paymentsTable();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.paymentId) patch["payment_id"] = input.paymentId;
  if (input.failureReason !== undefined) patch["failure_reason"] = input.failureReason;
  if (input.providerPayload !== undefined) patch["provider_payload"] = input.providerPayload;
  if (input.verified && !existing?.verified_at) patch["verified_at"] = new Date().toISOString();

  const { error } = await table.update(patch).eq("order_id", input.orderId);
  if (error) console.error("[payments] status update failed", error.message);
}


/** Applies a membership tier only after a payment has been verified server-side. */
export async function applyVerifiedMembership(userId: string, tier: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("profiles").update({ tier }).eq("id", userId);
  if (error) console.error("[payments] membership upgrade failed", error.message);
}


/* ------------------------------------------------------------------ *
 * Fulfilment guards
 *
 * A supplier booking (UP17 ticketing, membership activation) may only run
 * against a payment row that this server has already verified with Razorpay.
 * The claim below is a conditional UPDATE, so concurrent or duplicated
 * callbacks/webhooks can never both win the claim — only one caller can
 * transition `fulfilled_at` from NULL, and therefore only one ticket is ever
 * requested for a payment.
 * ------------------------------------------------------------------ */

type LooseQuery = {
  select: (columns: string) => LooseQuery;
  insert: (values: Record<string, unknown>) => LooseQuery;
  update: (values: Record<string, unknown>) => LooseQuery;
  eq: (column: string, value: string) => LooseQuery;
  is: (column: string, value: null) => LooseQuery;
  maybeSingle: () => Promise<{ data: unknown; error: DbError }>;
};

async function paymentsQuery(): Promise<LooseQuery> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.from as unknown as (table: string) => LooseQuery)("payments");
}

export type FulfilmentClaim =
  | { ok: true; payment: PaymentRow }
  | { ok: false; reason: "not_found" | "not_paid" | "already_fulfilled"; error: string };

/**
 * Atomically claims a verified payment for supplier fulfilment.
 * Returns `already_fulfilled` when another (duplicate) call already claimed it.
 */
export async function claimVerifiedPaymentForFulfilment(input: {
  orderId: string;
  paymentId: string;
  expectedUserId?: string | null;
}): Promise<FulfilmentClaim> {
  const existing = await getPaymentByOrderId(input.orderId);
  if (!existing) {
    return { ok: false, reason: "not_found", error: "No payment was found for this booking." };
  }
  if (existing.payment_id !== input.paymentId) {
    return { ok: false, reason: "not_found", error: "This payment does not belong to the order." };
  }
  if (existing.status !== "paid" || !existing.verified_at) {
    return {
      ok: false,
      reason: "not_paid",
      error: "This payment has not been verified. No ticket can be issued.",
    };
  }
  // Tenant isolation: a signed-in caller may only fulfil their own payment.
  if (input.expectedUserId && existing.user_id && existing.user_id !== input.expectedUserId) {
    return { ok: false, reason: "not_found", error: "This payment belongs to another account." };
  }
  if (existing.fulfilled_at) {
    return {
      ok: false,
      reason: "already_fulfilled",
      error: "This payment has already been used to issue a booking.",
    };
  }

  const table = await paymentsQuery();
  const { data, error } = await table
    .update({ fulfilled_at: new Date().toISOString() })
    .eq("order_id", input.orderId)
    .is("fulfilled_at", null)
    .select("id, user_id, purpose, plan_id, order_id, payment_id, amount_minor, currency, status, verified_at, fulfilled_at")
    .maybeSingle();

  if (error) {
    console.error("[payments] fulfilment claim failed", error.message);
    return { ok: false, reason: "not_found", error: "Could not lock this payment for ticketing." };
  }
  if (!data) {
    return {
      ok: false,
      reason: "already_fulfilled",
      error: "This payment has already been used to issue a booking.",
    };
  }
  return { ok: true, payment: data as PaymentRow };
}

/** Stores the supplier reference against a fulfilled payment. */
export async function recordFulfilment(orderId: string, reference: string): Promise<void> {
  const table = await paymentsQuery();
  const { error } = await (
    table.update({ fulfilment_reference: reference.slice(0, 120) }).eq("order_id", orderId) as unknown as Promise<{
      error: DbError;
    }>
  );
  if (error) console.error("[payments] fulfilment reference failed", error.message);
}

/** Releases the claim when the supplier declined and no ticket exists, so the guest may retry. */
export async function releaseFulfilmentClaim(orderId: string): Promise<void> {
  const table = await paymentsQuery();
  const { error } = await (
    table.update({ fulfilled_at: null }).eq("order_id", orderId) as unknown as Promise<{ error: DbError }>
  );
  if (error) console.error("[payments] fulfilment release failed", error.message);
}
