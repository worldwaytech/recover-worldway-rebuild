import { describe, expect, it } from "vitest";
import { firstPenaltyDay, policyVersion, policyWindows } from "./cancellation-policy";
const bands = [
  { daysFrom: 999, daysTo: 121, fixedAmount: 0 },
  { daysFrom: 120, daysTo: 91, amountPercent: 25 },
  { daysFrom: 50, daysTo: 0, amountPercent: 100 },
];
describe("crystal cancellation policy", () => {
  it("highlights the 120-day window", () => {
    expect(firstPenaltyDay(bands)).toBe(120);
    const w = policyWindows(bands, "2028-09-11");
    expect(w[0].hasPenalty).toBe(false);
    expect(w[1]).toMatchObject({ hasPenalty: true, penaltyLabel: "25% of fare", startDate: "2028-05-14" });
  });
  it("version changes when terms change", () => {
    const a = policyVersion("V1", "FIT", bands);
    expect(policyVersion("V1", "FIT", [...bands].reverse())).toBe(a);
    expect(policyVersion("V1", "FIT", [{ daysFrom: 120, daysTo: 0, amountPercent: 50 }])).not.toBe(a);
  });
});
