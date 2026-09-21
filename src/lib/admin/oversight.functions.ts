// Real finance and audit reads for the Admin console. Both are read-only and
// staff-gated; no browser-side mutation of payments or audit history exists.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: {
  userId: string;
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
}) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden");
}

export interface PaymentLedgerRow {
  id: string;
  source: "booking" | "gateway";
  reference: string;
  bookingReference: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  createdAt: string;
}

export const listPaymentLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 200;

    const [bookingPayments, gatewayPayments] = await Promise.all([
      supabaseAdmin
        .from("booking_payments")
        .select("id, booking_id, kind, amount, currency, method, status, created_at, gateway_reference")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("payments")
        .select("id, order_id, payment_id, purpose, amount_minor, currency, status, provider, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    const bookingIds = Array.from(
      new Set((bookingPayments.data ?? []).map((p) => p.booking_id).filter(Boolean)),
    );
    const refs = new Map<string, string>();
    if (bookingIds.length > 0) {
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("id, reference")
        .in("id", bookingIds);
      for (const b of bookings ?? []) refs.set(b.id, b.reference);
    }

    const rows: PaymentLedgerRow[] = [
      ...(bookingPayments.data ?? []).map((p) => ({
        id: p.id,
        source: "booking" as const,
        reference: p.gateway_reference ?? p.kind,
        bookingReference: refs.get(p.booking_id) ?? null,
        amount: Number(p.amount ?? 0),
        currency: p.currency,
        method: p.method,
        status: p.status,
        createdAt: p.created_at,
      })),
      ...(gatewayPayments.data ?? []).map((p) => ({
        id: p.id,
        source: "gateway" as const,
        reference: p.payment_id ?? p.order_id,
        bookingReference: null,
        amount: Number(p.amount_minor ?? 0) / 100,
        currency: p.currency,
        method: p.provider,
        status: p.status,
        createdAt: p.created_at,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { rows: rows.slice(0, limit) };
  });

export interface AuditTrailRow {
  id: string;
  at: string;
  source: "admin" | "integration";
  action: string;
  actor: string;
  target: string;
}

export const listAuditTrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(300).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 150;

    const [adminLog, integrationLog] = await Promise.all([
      supabaseAdmin
        .from("admin_audit_log")
        .select("id, created_at, action, actor_email, target_table, target_id")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("integration_audit")
        .select("id, created_at, action, actor_email, provider_key")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    const rows: AuditTrailRow[] = [
      ...(adminLog.data ?? []).map((r) => ({
        id: r.id,
        at: r.created_at,
        source: "admin" as const,
        action: r.action,
        actor: r.actor_email ?? "system",
        target: [r.target_table, r.target_id].filter(Boolean).join(" · ") || "—",
      })),
      ...(integrationLog.data ?? []).map((r) => ({
        id: r.id,
        at: r.created_at,
        source: "integration" as const,
        action: r.action,
        actor: r.actor_email ?? "system",
        target: r.provider_key ?? "—",
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return { rows: rows.slice(0, limit) };
  });
