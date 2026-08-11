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
    .select("id, user_id, purpose, plan_id, order_id, payment_id, amount_minor, currency, status")
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
  const table = await paymentsTable();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.paymentId) patch["payment_id"] = input.paymentId;
  if (input.failureReason !== undefined) patch["failure_reason"] = input.failureReason;
  if (input.providerPayload !== undefined) patch["provider_payload"] = input.providerPayload;
  if (input.verified) patch["verified_at"] = new Date().toISOString();

  const { error } = await table.update(patch).eq("order_id", input.orderId);
  if (error) console.error("[payments] status update failed", error.message);
}
