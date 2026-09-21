import { describe, expect, it } from "vitest";
import {
  RATEHAWK_BASE_PATH,
  RATEHAWK_ENDPOINTS,
  RATEHAWK_HOSTS,
  RATEHAWK_SECRET_NAMES,
  RATEHAWK_TIMEOUTS_MS,
  ratehawkEndpointUrl,
} from "../config";
import { normaliseHotelOffers, normaliseRate } from "../hotels.server";

describe("RateHawk configuration", () => {
  it("keeps the documented sandbox and production hosts separate", () => {
    expect(RATEHAWK_HOSTS.sandbox).toBe("https://api-sandbox.ratehawk.com");
    expect(RATEHAWK_HOSTS.production).toBe("https://api.ratehawk.com");
    expect(RATEHAWK_HOSTS.sandbox).not.toBe(RATEHAWK_HOSTS.production);
  });

  it("uses the documented ETG v3 paths for the full booking lifecycle", () => {
    expect(RATEHAWK_BASE_PATH).toBe("/api/b2b/v3");
    expect(RATEHAWK_ENDPOINTS.searchRegion).toBe("/search/serp/region/");
    expect(RATEHAWK_ENDPOINTS.hotelPage).toBe("/search/hp/");
    expect(RATEHAWK_ENDPOINTS.hotelInfo).toBe("/hotel/info/");
    expect(RATEHAWK_ENDPOINTS.prebook).toBe("/hotel/prebook/");
    expect(RATEHAWK_ENDPOINTS.bookingForm).toBe("/hotel/order/booking/form/");
    expect(RATEHAWK_ENDPOINTS.bookingFinish).toBe("/hotel/order/booking/finish/");
    expect(RATEHAWK_ENDPOINTS.bookingStatus).toBe("/hotel/order/booking/finish/status/");
    expect(RATEHAWK_ENDPOINTS.orderInfo).toBe("/hotel/order/info/");
    expect(RATEHAWK_ENDPOINTS.cancel).toBe("/hotel/order/cancel/");
  });

  it("builds sandbox URLs against the sandbox host only", () => {
    expect(ratehawkEndpointUrl(RATEHAWK_HOSTS.sandbox, "prebook")).toBe(
      "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/prebook/",
    );
  });

  it("honours the documented minimum prebook timeout of 30 seconds", () => {
    expect(RATEHAWK_TIMEOUTS_MS.prebook).toBeGreaterThanOrEqual(30_000);
  });

  it("references credentials by secret name only", () => {
    expect([...RATEHAWK_SECRET_NAMES]).toEqual(["RATEHAWK_KEY_ID", "RATEHAWK_API_KEY"]);
  });
});

describe("RateHawk rate normalisation", () => {
  const rate = {
    book_hash: "p-1234abcd-0000",
    match_hash: "m-1234abcd",
    room_name: "Deluxe Double Room",
    meal: "breakfast",
    allotment: 3,
    rg_ext: { refundable: true },
    payment_options: {
      payment_types: [
        {
          type: "deposit",
          amount: "412.50",
          currency_code: "EUR",
          tax_data: {
            taxes: [
              { name: "vat", amount: "41.25", currency_code: "EUR", included_by_supplier: true },
              { name: "city_tax", amount: "7.00", currency_code: "EUR", included_by_supplier: false },
            ],
          },
          cancellation_penalties: {
            policies: [{ start_at: null, end_at: "2027-02-20T12:00:00", amount_charge: "0.00" }],
          },
        },
      ],
    },
  };

  it("maps price, taxes, policies and refundability from the supplier payload", () => {
    const parsed = normaliseRate(rate);
    expect(parsed?.price).toEqual({ amount: 412.5, currency: "EUR" });
    expect(parsed?.taxesAndFees).toHaveLength(2);
    expect(parsed?.taxesAndFees[1]).toMatchObject({ name: "city_tax", includedInPrice: false });
    expect(parsed?.cancellationPolicies[0]?.penalty.amount).toBe(0);
    expect(parsed?.refundable).toBe(true);
    expect(parsed?.allotment).toBe(3);
  });

  it("drops rates with no book_hash rather than inventing one", () => {
    expect(normaliseRate({ room_name: "No hash" })).toBeNull();
  });

  it("normalises a SERP payload into hotel offers", () => {
    const offers = normaliseHotelOffers({ hotels: [{ id: "test_hotel", hid: 8473727, rates: [rate] }] });
    expect(offers).toHaveLength(1);
    expect(offers[0]?.hid).toBe(8473727);
    expect(offers[0]?.rates[0]?.bookHash).toBe("p-1234abcd-0000");
  });

  it("returns nothing for an empty supplier response instead of placeholder data", () => {
    expect(normaliseHotelOffers({})).toEqual([]);
  });
});
