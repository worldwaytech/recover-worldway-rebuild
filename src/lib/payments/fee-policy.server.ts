import { createClient } from "@supabase/supabase-js";
import type { FeePolicy } from "./fee-policy";

/** Reads the public fee rules with the publishable key (read-only policy). Fails safe to absorb. */
export async function loadFeeRules(): Promise<FeePolicy[]> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return [];
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
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
