import { describe, it, expect } from "vitest";
import { optimiseMargin } from "../intelligence/margin";

const line = (net: number, markup: number) => ({ componentId: "c", currency: "INR", customerPrice: net + markup,
  steps: [{ label: "Supplier net", amount: net }, { label: "Taxes & fees", amount: 0 }, { label: "Markup", amount: markup }, { label: "Commission", amount: 0 }, { label: "Service fee", amount: 0 }] });

describe("margin optimiser", () => {
  it("keeps the approved markup when within budget", () => {
    expect(optimiseMargin([line(1000, 100)], 2000).marginKeptPercent).toBe(100);
  });
  it("never discounts when no floor is approved", () => {
    const r = optimiseMargin([line(1000, 100)], 1050);
    expect(r.suggestedTotal).toBeNull();
  });
  it("reduces markup only down to the approved floor to fit budget", () => {
    const r = optimiseMargin([line(1000, 100)], 1060, 50);
    expect(r.suggestedTotal).toBeLessThanOrEqual(1060);
    expect(r.suggestedTotal).toBeGreaterThanOrEqual(1050);
    expect(optimiseMargin([line(1000, 100)], 1040, 50).suggestedTotal).toBeNull();
  });
  it("never goes above the approved price", () => {
    expect(optimiseMargin([line(1000, 100)], 99999, 0).suggestedTotal).toBe(1100);
  });
});
