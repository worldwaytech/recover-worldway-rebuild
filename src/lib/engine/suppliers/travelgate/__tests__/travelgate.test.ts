import { describe, expect, it } from "vitest";
import { travelgateCredentialStatus } from "../client.server";
import { travelgateHotelsToCanonical } from "../travelgate.server";

describe("Travelgate foundation", () => {
  it("fails closed when credentials are absent", () => {
    const key = process.env.TRAVELGATE_API_KEY;
    const client = process.env.TRAVELGATE_CLIENT;
    delete process.env.TRAVELGATE_API_KEY;
    delete process.env.TRAVELGATE_CLIENT;
    expect(travelgateCredentialStatus().configured).toBe(false);
    if (key === undefined) delete process.env.TRAVELGATE_API_KEY;
    else process.env.TRAVELGATE_API_KEY = key;
    if (client === undefined) delete process.env.TRAVELGATE_CLIENT;
    else process.env.TRAVELGATE_CLIENT = client;
  });

  it("normalizes hotel offers without marking them revalidated", () => {
    const offers = travelgateHotelsToCanonical(
      [{
        id: "tg-option-1",
        hotelCode: "H100",
        hotelName: "Test Hotel",
        price: { net: { amount: 150, currency: "EUR" } },
        cancelPolicy: { refundable: true },
      }],
      { cityIata: "DEL", checkin: "2026-10-20", checkout: "2026-10-23" },
      "2026-10-03T00:00:00.000Z",
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]?.supplierKey).toBe("travelgate");
    expect(offers[0]?.kind).toBe("stay");
    expect(offers[0]?.net).toEqual({ amount: 150, currency: "EUR" });
    expect(offers[0]?.revalidatedAt).toBeUndefined();
  });

  it("rejects unusable options instead of guessing", () => {
    expect(travelgateHotelsToCanonical(
      [{ id: "bad", hotelName: "No Price" }],
      { cityIata: "DEL", checkin: "2026-10-20", checkout: "2026-10-23" },
      new Date().toISOString(),
    )).toEqual([]);
  });
});
