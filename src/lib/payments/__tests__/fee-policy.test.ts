import { describe, expect, it } from "vitest";
import { chargeLines, resolveFeePolicy, type FeePolicy } from "../fee-policy";

const r = (product: string, method: string, mode: FeePolicy["mode"]): FeePolicy => ({ product, method, mode, serviceFeePercent: 0 });

describe("payment fee policy", () => {
  it("defaults to Worldway absorbing the fee", () => {
    expect(resolveFeePolicy([], "cruise", "card").mode).toBe("absorb");
  });
  it("most specific rule wins", () => {
    const rules = [r("*", "*", "absorb"), r("cruise", "*", "pass_through"), r("cruise", "upi", "absorb")];
    expect(resolveFeePolicy(rules, "cruise", "card").mode).toBe("pass_through");
    expect(resolveFeePolicy(rules, "cruise", "upi").mode).toBe("absorb");
    expect(resolveFeePolicy(rules, "flight", "card").mode).toBe("absorb");
  });
  it("never charges a gateway fee on wallet payments", () => {
    expect(resolveFeePolicy([r("*", "*", "pass_through")], "hotel", "wallet").mode).toBe("absorb");
  });
  it("never invents a fee amount", () => {
    const lines = chargeLines({ amountMinor: 1000, policy: r("x", "*", "pass_through") });
    expect(lines.find((l) => l.label.includes("fee"))?.amountMinor).toBeNull();
  });
});
