import { describe, expect, it } from "vitest";
import { checkChronology, requiredCheckInDate } from "../chronology";
import { priceComponent } from "../pricing";
import { rankPackages } from "../ranking";
import type { NormalizedComponent, SupplierRegistration } from "../types";

const base = {
  net: { amount: 100, currency: "USD" },
  taxes: { amount: 10, currency: "USD" },
  cancellation: { refundable: true },
};

// Departs Delhi 28 Sep 22:00 IST, lands New York 29 Sep 05:00 EDT.
const flight: NormalizedComponent = {
  ...base,
  id: "f1", kind: "flight", supplierKey: "air", externalId: "X", title: "DEL-JFK",
  start: { at: "2026-09-28T16:30:00Z", timezone: "Asia/Kolkata", place: "DEL" },
  end: { at: "2026-09-29T09:00:00Z", timezone: "America/New_York", place: "JFK" },
};
const transfer: NormalizedComponent = {
  ...base, id: "t1", kind: "transfer", supplierKey: "cab", externalId: "T", title: "JFK-hotel",
  start: { at: "2026-09-29T10:00:00Z", timezone: "America/New_York", place: "JFK" },
  end: { at: "2026-09-29T11:00:00Z", timezone: "America/New_York", place: "NYC" },
};
const stay = (at: string): NormalizedComponent => ({
  ...base, id: "h1", kind: "stay", supplierKey: "hotel", externalId: "H", title: "Hotel",
  start: { at, timezone: "America/New_York", place: "NYC" },
  end: { at: "2026-10-02T15:00:00Z", timezone: "America/New_York", place: "NYC" },
});

describe("chronology", () => {
  it("check-in follows local arrival date, not departure date", () => {
    expect(requiredCheckInDate(flight)).toBe("2026-09-29");
  });
  it("flags hotel booked on departure date", () => {
    const issues = checkChronology([flight, transfer, stay("2026-09-28T19:00:00Z")]);
    expect(issues.some((i) => i.code === "hotel-date-mismatch")).toBe(true);
  });
  it("accepts correct hotel date", () => {
    const issues = checkChronology([flight, transfer, stay("2026-09-29T19:00:00Z")]);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
  it("flags tight connections and overlaps", () => {
    const f2 = { ...flight, id: "f2", start: { ...flight.end, at: "2026-09-29T09:30:00Z" }, end: { ...flight.end, at: "2026-09-29T12:00:00Z", place: "LAX" } };
    const codes = checkChronology([flight, f2]).map((i) => i.code);
    expect(codes).toContain("impossible-connection");
    const f3 = { ...f2, id: "f3", start: { ...f2.start, at: "2026-09-29T08:00:00Z" } };
    expect(checkChronology([flight, f3]).map((i) => i.code)).toContain("overlap");
  });
  it("warns on missing transfer", () => {
    const act = { ...transfer, id: "a1", kind: "activity" as const, start: { ...transfer.start, place: "NYC" } };
    expect(checkChronology([flight, act]).map((i) => i.code)).toContain("missing-transfer");
  });
});

describe("pricing", () => {
  it("records each step", () => {
    const p = priceComponent(flight, "INR", { USD: 83 }, { markupPercent: 5, commissionPercent: 0, serviceFee: 0 });
    expect(p.steps[0]!.amount).toBe(8300);
    expect(p.customerPrice).toBe(9586.5);
  });
  it("refuses unknown FX", () => {
    expect(() => priceComponent(flight, "EUR", {}, { markupPercent: 0, commissionPercent: 0, serviceFee: 0 })).toThrow();
  });
});

describe("ranking", () => {
  const reg = new Map<string, SupplierRegistration>([
    ["air", { supplierKey: "air", kinds: ["flight"], capabilities: ["search", "book"], readiness: "production", reliability: 0.9 }],
    ["cab", { supplierKey: "cab", kinds: ["transfer"], capabilities: ["search"], readiness: "uat", reliability: 0.5 }],
    ["hotel", { supplierKey: "hotel", kinds: ["stay"], capabilities: ["search", "book"], readiness: "production", reliability: 0.9 }],
  ]);
  it("ranks feasible package above infeasible and explains the score", () => {
    const ranked = rankPackages(
      [
        { id: "bad", items: [flight, transfer, stay("2026-09-28T19:00:00Z")], total: 300 },
        { id: "good", items: [flight, transfer, stay("2026-09-29T19:00:00Z")], total: 330 },
      ],
      { origin: "DEL", destinations: ["NYC"], departFrom: "2026-09-28", returnBy: "2026-10-02", adults: 2, children: 0, luxuryLevel: 3, interests: [] },
      reg,
    );
    expect(ranked[0]!.id).toBe("good");
    expect(ranked[0]!.factors.length).toBeGreaterThan(0);
    // UAT cab + not revalidated => not bookable
    expect(ranked[0]!.bookable).toBe(false);
  });
});
