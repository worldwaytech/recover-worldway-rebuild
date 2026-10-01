import { describe, expect, it } from "vitest";
import { depositFrom, razorpayLimitMinor } from "../deposit.server";

describe("Crystal deposit", () => {
  it("uses Crystal's own option percentage", () => {
    expect(depositFrom(10800, 25)).toBe(2700);
    expect(depositFrom(13300.5, 25)).toBe(3325.13);
  });
  it("refuses to invent a deposit when none is published", () => {
    expect(depositFrom(10800, null)).toBeNull();
    expect(depositFrom(10800, 0)).toBeNull();
    expect(depositFrom(0, 25)).toBeNull();
    expect(depositFrom(100, 120)).toBeNull();
  });
  it("has a positive card limit in paise", () => {
    expect(razorpayLimitMinor()).toBeGreaterThan(0);
  });
});
