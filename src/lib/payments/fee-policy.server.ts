import type { FeePolicy } from "./fee-policy";

/** Reads only the four rule columns server-side (table is staff-only). Fails safe to absorb. */
export async function loadFeeRules(): Promise<FeePolicy[]> {
  let client;
  try {
    ({ supabaseAdmin: client } = await import("@/integrations/supabase/client.server"));
  } catch {
    return [];
  }
  const { data, error } = await client.from("payment_fee_policies").select("product, method, mode, service_fee_percent");
  if (error) {
    console.error("[fee-policy] rules unavailable", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    product: r.product,
    method: r.method,
    mode: r.mode === "pass_through" ? "pass_through" : "absorb",
    serviceFeePercent: Number(r.service_fee_percent) || 0,
  }));
}
