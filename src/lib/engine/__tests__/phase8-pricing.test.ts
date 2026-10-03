import { describe, expect, it } from "vitest";
import {
  calculateRevenueSnapshot,
  priceDynamicComponent,
  pricePackageDynamically,
  recommendDynamicMarkup,
  type PricingPolicy,
} from "../pricing";
import type { NormalizedComponent } from "../types";

const component: NormalizedComponent = {
  id: "hotel-1",
  kind: "stay",
  supplierKey: "supplier-a",
  externalId: "H1",
  title: "Luxury Hotel",
  start: { at: "2026-11-10T12:00:00Z", timezone: "Europe/Istanbul", place: "IST" },
  end: { at: "2026-11-12T10:00:00Z", timezone: "Europe/Istanbul", place: "IST" },
  net: { amount: 1000, currency: "EUR" },
  taxes: { amount: 100, currency: "EUR" },
  cancellation: { refundable: true },
};

const policy: PricingPolicy = {
  currency: "USD",
  channel: "customer_b2c",
  baseRule: { markupPercent: 20, commissionPercent: 5, serviceFee: 25 },
  minimumMarginPercent: 10,
  maxDynamicMarkupDeltaPercent: 5,
  promotions: [
    { id: "WELCOME10", percentOff: 10, channels: ["customer_b2c"] },
  ],
};

describe("Phase 8 dynamic pricing", () => {
  it("keeps dynamic markup inside the configured bound", () => {
    const result = recommendDynamicMarkup(policy.baseRule, {
      demandIndex: 1,
      inventoryPressure: 1,
      conversionIndex: 1,
      leadTimeDays: 1,
    }, 5);
    expect(result.markupPercent).toBeGreaterThanOrEqual(20);
    expect(result.markupPercent).toBeLessThanOrEqual(25);
  });

  it("applies FX, channel pricing and an eligible promotion while preserving the margin floor", () => {
    const quote = priceDynamicComponent({
      component,
      fx: { EUR: 1.1 },
      policy,
      now: "2026-10-03T00:00:00Z",
      signals: { demandIndex: 0.5, inventoryPressure: 0.5, conversionIndex: 0.5, leadTimeDays: 14 },
    });
    expect(quote.currency).toBe("USD");
    expect(quote.promotionId).toBe("WELCOME10");
    expect(quote.promotionDiscount).toBeLessThan(quote.supplierCost * 0.10 + quote.markup * 0.10 + quote.commission * 0.10 + 1);
    expect(quote.customerPrice).toBeGreaterThan(0);
    expect(quote.grossMarginPercent).toBeGreaterThanOrEqual(10);
    expect(quote.audit).toContain("promotion:WELCOME10");
  });

  it("caps promotions at the configured margin floor", () => {
    const strict: PricingPolicy = {
      ...policy,
      minimumMarginPercent: 15,
      promotions: [{ id: "DEEP", percentOff: 30, channels: ["customer_b2c"] }],
    };
    const quote = priceDynamicComponent({
      component,
      fx: { EUR: 1.1 },
      policy: strict,
      now: "2026-10-03T00:00:00Z",
    });
    expect(quote.promotionId).toBe("DEEP");
    expect(quote.grossMarginPercent).toBeGreaterThanOrEqual(15);
    expect(quote.promotionDiscount).toBeLessThan(quote.customerPrice * 0.3);
  });

  it("produces auditable package revenue metrics", () => {
    const result = pricePackageDynamically(
      [component],
      { EUR: 1.1 },
      policy,
      () => ({ demandIndex: 0.5 }),
      "2026-10-03T00:00:00Z",
    );
    const snapshot = calculateRevenueSnapshot(result.lines);
    expect(snapshot.bookings).toBe(1);
    expect(snapshot.grossSales).toBe(result.total);
    expect(snapshot.grossProfit).toBe(result.grossProfit);
    expect(snapshot.averageBookingValue).toBe(result.total);
  });
});
