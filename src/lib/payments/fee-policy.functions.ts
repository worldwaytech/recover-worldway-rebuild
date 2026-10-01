import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_staff", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

export const listFeePolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data: rules } = await (context.supabase as any)
      .from("payment_fee_policies").select("product, method, mode, service_fee_percent, note, updated_at").order("product");
    // Actual gateway fees as reported by Razorpay on captured payments (last 200).
    const { data: pays } = await (context.supabase as any)
      .from("payments").select("purpose, amount_minor, currency, provider_payload, status")
      .eq("status", "paid").order("created_at", { ascending: false }).limit(200);
    const byPurpose: Record<string, { count: number; amountMinor: number; feeMinor: number; taxMinor: number; currency: string }> = {};
    for (const p of pays ?? []) {
      const pl = (p.provider_payload ?? {}) as { fee?: number; tax?: number };
      if (typeof pl.fee !== "number") continue;
      const k = `${p.purpose}:${p.currency}`;
      const b = (byPurpose[k] ??= { count: 0, amountMinor: 0, feeMinor: 0, taxMinor: 0, currency: p.currency });
      b.count++; b.amountMinor += Number(p.amount_minor); b.feeMinor += pl.fee; b.taxMinor += pl.tax ?? 0;
    }
    return { rules: rules ?? [], actualFees: Object.entries(byPurpose).map(([k, v]) => ({ purpose: k.split(":")[0]!, ...v })) };
  });

export const saveFeePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      product: z.string().min(1).max(40),
      method: z.string().min(1).max(20),
      mode: z.enum(["absorb", "pass_through"]),
      serviceFeePercent: z.number().min(0).max(10),
      note: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if (data.method === "wallet" && data.mode !== "absorb") throw new Error("Wallet payments never carry a gateway fee.");
    // Pass-through needs Razorpay's account-wide "customer fee bearer" switched on, and a
    // separate service fee needs amount handling across every booking engine; until both
    // are in place, saving them would show customers a charge the system cannot collect.
    if (data.mode === "pass_through") throw new Error("Customer-paid fees need Razorpay's 'customer fee bearer' enabled on the account first.");
    if (data.serviceFeePercent > 0) throw new Error("A Worldway service fee is not switched on yet.");
    const { error } = await (context.supabase as any).from("payment_fee_policies").upsert(
      { product: data.product, method: data.method, mode: data.mode, service_fee_percent: data.serviceFeePercent, note: data.note ?? null, updated_by: context.userId },
      { onConflict: "product,method" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Charge breakdown for a checkout, from the real fee rules (server-side).
 * Never estimates a gateway fee: absorb → ₹0; pass-through → disclosed by the payment window.
 */
export const getFeeQuote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      product: z.string().min(1).max(40),
      method: z.enum(["card", "upi", "netbanking", "wallet"]),
      amountMinor: z.number().int().nonnegative(),
      currency: z.string().length(3),
      fx: z.object({ sourceCurrency: z.string().length(3), sourceAmount: z.number().nonnegative(), rate: z.number().positive() }).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadFeeRules } = await import("./fee-policy.server");
    const { resolveFeePolicy, chargeLines } = await import("./fee-policy");
    const policy = resolveFeePolicy(await loadFeeRules(), data.product, data.method);
    return {
      mode: policy.mode,
      lines: chargeLines({ amountMinor: data.amountMinor, policy, method: data.method, fx: data.fx ?? null }),
      // Total payable before any gateway-disclosed fee; the order amount the server charges.
      totalMinor: data.amountMinor,
      currency: data.currency,
    };
  });
