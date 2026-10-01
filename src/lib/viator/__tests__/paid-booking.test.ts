import { describe, expect, it } from "vitest";
import { activityCustomerPrice, ageBandAnswers, resolveGuideLanguage } from "../paid-booking.server";

describe("Viator affiliate paid booking", () => {
  it("applies the approved markup to the live retail price", () => {
    expect(activityCustomerPrice({ retail: 438, cost: 395.84, markupPercent: 12 })).toEqual({ ok: true, price: 490.56 });
  });
  it("refuses when no markup is approved or the price would fall below cost", () => {
    expect(activityCustomerPrice({ retail: 438, cost: 395.84, markupPercent: null }).ok).toBe(false);
    expect(activityCustomerPrice({ retail: 300, cost: 395.84, markupPercent: 0 }).ok).toBe(false);
    expect(activityCustomerPrice({ retail: 0, cost: null, markupPercent: 12 }).ok).toBe(false);
  });
  it("requires a listed guide language when the product offers guides", () => {
    const choices = [{ type: "GUIDE", language: "en" }];
    expect(resolveGuideLanguage(choices, undefined).ok).toBe(false);
    expect(resolveGuideLanguage(choices, { type: "GUIDE", language: "fr" }).ok).toBe(false);
    expect(resolveGuideLanguage(choices, { type: "GUIDE", language: "en" })).toEqual({ ok: true, guide: choices[0] });
    expect(resolveGuideLanguage([], undefined)).toEqual({ ok: true, guide: null });
  });
  it("derives one AGEBAND answer per traveller from the party", () => {
    expect(ageBandAnswers([{ ageBand: "ADULT", count: 2 }, { ageBand: "CHILD", count: 1 }])).toEqual([
      { question: "AGEBAND", answer: "ADULT", travelerNum: 1 },
      { question: "AGEBAND", answer: "ADULT", travelerNum: 2 },
      { question: "AGEBAND", answer: "CHILD", travelerNum: 3 },
    ]);
  });
});
