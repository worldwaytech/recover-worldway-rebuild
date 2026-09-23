// RateHawk lifecycle + customer output contracts. Pure unit tests: no network.
import { describe, expect, it } from "vitest";
import { computeCustomerPrice, WORLDWAY_DEFAULT_PRICING } from "../pricing";
import { buildWorldwayVoucher, mapRatehawkStatus } from "../voucher";

describe("mapRatehawkStatus", () => {
  it("never treats unknown as a final failure", () => {
    expect(mapRatehawkStatus({ errorCode: "unknown" })).toBe("pending");
    expect(mapRatehawkStatus({ errorCode: "unknown", dataStatus: "processing" })).toBe("pending");
  });

  it("resolves unknown to confirmed once the supplier reports ok", () => {
    expect(mapRatehawkStatus({ errorCode: "unknown", dataStatus: "ok" })).toBe("confirmed");
    expect(mapRatehawkStatus({ orderStatus: "completed" })).toBe("confirmed");
  });

  it("maps the documented certification failures", () => {
    expect(mapRatehawkStatus({ errorCode: "soldout" })).toBe("failed-soldout");
    expect(mapRatehawkStatus({ errorCode: "book_limit" })).toBe("failed-book-limit");
  });

  it("maps cancelled orders and other supplier errors", () => {
    expect(mapRatehawkStatus({ orderStatus: "cancelled" })).toBe("cancelled");
    expect(mapRatehawkStatus({ errorCode: "rate_not_found" })).toBe("failed");
  });
});

describe("computeCustomerPrice", () => {
  it("adds markup and fees on top of the supplier net cost", () => {
    const price = computeCustomerPrice(
      { amount: 354, currency: "USD" },
      { markupPercent: 12, serviceFeePercent: 2, fixedFee: 5 },
    );
    expect(price).not.toBeNull();
    expect(price?.supplierNet.amount).toBe(354);
    expect(price?.markupAmount).toBe(42.48);
    expect(price?.serviceFeeAmount).toBe(7.08);
    expect(price?.customerTotal).toBe(408.56);
    expect(price?.currency).toBe("USD");
  });

  it("never invents a price when the supplier gave none", () => {
    expect(computeCustomerPrice({ amount: null, currency: "USD" })).toBeNull();
  });

  it("defaults to no markup rather than a guessed figure", () => {
    const price = computeCustomerPrice({ amount: 100, currency: "EUR" }, WORLDWAY_DEFAULT_PRICING);
    expect(price?.customerTotal).toBe(100);
  });
});

describe("buildWorldwayVoucher", () => {
  const base = {
    worldwayReference: "wwl-sbx-abc_unknown_success",
    ratehawkOrderId: 100067385,
    hotelName: "Test Hotel",
    hotelId: "test_hotel",
    hid: 10004834,
    checkin: "2026-11-22",
    checkout: "2026-11-24",
    roomName: "Standard Double room",
    mealType: "nomeal",
    guests: [{ firstName: "Sandbox", lastName: "Traveller" }],
    price: computeCustomerPrice({ amount: 354, currency: "USD" }, { markupPercent: 12, serviceFeePercent: 0, fixedFee: 0 }),
    cancellationPolicies: [{ startAt: null, endAt: null, penalty: { amount: 354, currency: "USD" } }],
  };

  it("issues a voucher for a confirmed booking with both references", () => {
    const voucher = buildWorldwayVoucher({ ...base, status: "confirmed" });
    expect(voucher?.worldwayReference).toBe(base.worldwayReference);
    expect(voucher?.ratehawkOrderId).toBe(100067385);
    expect(voucher?.stay.nights).toBe(2);
    expect(voucher?.price.customerTotal).toBe(396.48);
    expect(voucher?.cancellation.policies).toHaveLength(1);
  });

  it("issues no voucher before confirmation or after failure", () => {
    for (const status of ["pending", "failed-soldout", "failed-book-limit", "cancelled", "failed"] as const) {
      expect(buildWorldwayVoucher({ ...base, status })).toBeNull();
    }
  });

  it("issues no voucher without a real supplier price", () => {
    expect(buildWorldwayVoucher({ ...base, status: "confirmed", price: null })).toBeNull();
  });
});
