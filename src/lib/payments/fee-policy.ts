// Global payment fee policy — pure and client-safe.
// Default for every product and method: Worldway absorbs the gateway fee.
// Gateway fees are NEVER estimated here: the only real figure is the fee
// Razorpay reports on the captured payment, recorded for reconciliation.

export type FeeMode = "absorb" | "pass_through";
export type FeePolicy = { product: string; method: string; mode: FeeMode; serviceFeePercent: number };

export const DEFAULT_POLICY: Omit<FeePolicy, "product"> = { method: "*", mode: "absorb", serviceFeePercent: 0 };

/** Most specific rule wins: product+method → product+* → *+method → *+* → absorb. */
export function resolveFeePolicy(rules: FeePolicy[], product: string, method: string): FeePolicy {
  const pick = (p: string, m: string) => rules.find((r) => r.product === p && r.method === m);
  const hit = pick(product, method) ?? pick(product, "*") ?? pick("*", method) ?? pick("*", "*");
  const base = hit ?? { ...DEFAULT_POLICY, product };
  // Wallet payments never carry a gateway fee: it belonged to the top-up.
  return method === "wallet" ? { ...base, mode: "absorb" } : base;
}

export type ChargeLine = { label: string; amountMinor: number | null; note?: string };

/** Lines shown to the customer before they authorise payment. */
export function chargeLines(input: {
  amountMinor: number;
  policy: FeePolicy;
  method?: string;
  fx?: { sourceCurrency: string; sourceAmount: number; rate: number } | null;
}): ChargeLine[] {
  const lines: ChargeLine[] = [{ label: "Booking amount", amountMinor: input.amountMinor }];
  if (input.fx) {
    lines.push({
      label: "Currency conversion",
      amountMinor: null,
      note: `${input.fx.sourceCurrency} ${input.fx.sourceAmount.toLocaleString("en-IN")} at live rate ${input.fx.rate.toFixed(4)}, locked for this checkout`,
    });
  }
  lines.push(
    input.policy.mode === "absorb"
      ? { label: "Payment processing fee", amountMinor: 0, note: input.method === "wallet" ? "None on Wallet payments" : "Paid by Worldway" }
      : { label: "Payment processing fee", amountMinor: null, note: "Shown by the payment window for your chosen method before you pay" },
  );
  return lines;
}
