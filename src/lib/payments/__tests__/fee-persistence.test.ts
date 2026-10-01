import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { mergeProviderPayload } from "../payments.server";
import { chargeLines, resolveFeePolicy } from "../fee-policy";
import { readFileSync } from "node:fs";

describe("gateway fee persistence", () => {
  it("a later webhook never wipes the recorded fee/tax", () => {
    const afterCheckout = { status: "captured", method: "card", amount: 100000, fee: 2360, tax: 360 };
    const webhook = { source: "webhook", event: "payment.captured", method: "card", amount: 100000, fee: null, tax: null };
    expect(mergeProviderPayload(afterCheckout, webhook)).toMatchObject({ fee: 2360, tax: 360, source: "webhook" });
  });
  it("a webhook that carries the fee records it", () => {
    expect(mergeProviderPayload({}, { fee: 1180, tax: 180 })).toEqual({ fee: 1180, tax: 180 });
  });
  it("duplicate webhooks are idempotent", () => {
    const once = mergeProviderPayload({ fee: 10 }, { event: "payment.captured", fee: 10 });
    expect(mergeProviderPayload(once, { event: "payment.captured", fee: 10 })).toEqual(once);
  });
});

describe("checkout breakdown from real rules", () => {
  it("absorb → ₹0 card fee, wallet always ₹0, total = order amount", () => {
    const card = chargeLines({ amountMinor: 50000, policy: resolveFeePolicy([], "flight", "card"), method: "card" });
    const wallet = chargeLines({ amountMinor: 50000, policy: resolveFeePolicy([{ product: "*", method: "*", mode: "pass_through", serviceFeePercent: 0 }], "flight", "wallet"), method: "wallet" });
    expect(card.find((l) => l.label === "Payment processing fee")?.amountMinor).toBe(0);
    expect(wallet.find((l) => l.label === "Payment processing fee")?.amountMinor).toBe(0);
    expect(card[0]!.amountMinor).toBe(50000);
  });
  it("product/method override is honoured", () => {
    const rules = [{ product: "cruise", method: "card", mode: "pass_through" as const, serviceFeePercent: 0 }];
    expect(resolveFeePolicy(rules, "cruise", "card").mode).toBe("pass_through");
    expect(resolveFeePolicy(rules, "cruise", "upi").mode).toBe("absorb");
    expect(resolveFeePolicy(rules, "hotel", "card").mode).toBe("absorb");
  });
  it("no checkout hard-codes the fee line", () => {
    for (const f of ["src/components/up17/travel-checkout.tsx", "src/components/up17/flight-booking-dialog.tsx", "src/routes/wallet.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("ChargeBreakdown");
      expect(src).not.toMatch(/paid by Worldway/i);
    }
  });
});
