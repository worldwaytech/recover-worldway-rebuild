import { describe, expect, it } from "vitest";
import {
  buildMerchantBookBody,
  buildMerchantHoldBody,
  mapMerchantStatuses,
} from "@/lib/viator-merchant/booking.server";
import { MERCHANT_SANDBOX_BASE } from "@/lib/viator-merchant/client.server";

const booker = {
  firstName: "Test",
  lastName: "Booker",
  email: "qa@example.com",
  phone: "+971501234567",
};

const holdInput = {
  hold: {
    productCode: "75760P4",
    productOptionCode: "DEFAULT",
    startTime: "10:00",
    travelDate: "2026-11-08",
    currency: "USD",
    paxMix: [{ ageBand: "ADULT", count: 2 }],
    languageGuide: { type: "GUIDE", language: "en" },
  },
  partnerCartRef: "CART-WWT-MERCH-1",
  partnerBookingRef: "WWT-MERCH-1",
  booker,
  hostingUrl: "https://www.worldwaytravelsgroup.com",
};

describe("merchant sandbox isolation", () => {
  it("is pinned to the sandbox host — no production URL is reachable", () => {
    expect(MERCHANT_SANDBOX_BASE).toBe("https://api.sandbox.viator.com/partner");
    expect(MERCHANT_SANDBOX_BASE).not.toContain("api.viator.com/partner");
  });
});

describe("buildMerchantHoldBody", () => {
  it("never sends payment fields (sandbox merchant mode rejects them)", () => {
    const body = buildMerchantHoldBody(holdInput);
    expect(body).not.toHaveProperty("paymentDataSubmissionMode");
    expect(body).not.toHaveProperty("paymentToken");
    expect(body).not.toHaveProperty("paymentSessionToken");
  });

  it("sends option code, start time, pax mix and our idempotent references", () => {
    const body = buildMerchantHoldBody(holdInput);
    const items = body["items"] as Record<string, unknown>[];
    expect(items[0]).toMatchObject({
      partnerBookingRef: "WWT-MERCH-1",
      productCode: "75760P4",
      productOptionCode: "DEFAULT",
      startTime: "10:00",
      travelDate: "2026-11-08",
      languageGuide: { type: "GUIDE", language: "en" },
    });
    expect(items[0]?.["paxMix"]).toEqual([{ ageBand: "ADULT", numberOfTravelers: 2 }]);
    expect(body["partnerCartRef"]).toBe("CART-WWT-MERCH-1");
    expect(body["hostingUrl"]).toBe("https://www.worldwaytravelsgroup.com");
  });

  it("omits startTime and languageGuide when not selected", () => {
    const body = buildMerchantHoldBody({
      ...holdInput,
      hold: {
        productCode: "75760P4",
        productOptionCode: "DEFAULT",
        travelDate: "2026-11-08",
        currency: "USD",
        paxMix: [{ ageBand: "ADULT", count: 1 }],
      },
    });
    const items = body["items"] as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty("startTime");
    expect(items[0]).not.toHaveProperty("languageGuide");
  });
});

describe("buildMerchantBookBody", () => {
  it("sends cartRef, booker and per-item answers; no payment token", () => {
    const body = buildMerchantBookBody({
      cartRef: "CR-1",
      booker,
      items: [
        {
          bookingRef: "BR-1",
          languageGuide: { type: "GUIDE", language: "en" },
          bookingQuestionAnswers: [{ question: "PICKUP_POINT", answer: "Hotel", travelerNum: 1 }],
        },
      ],
    });
    expect(body).not.toHaveProperty("paymentToken");
    expect(body["cartRef"]).toBe("CR-1");
    const items = body["items"] as Record<string, unknown>[];
    expect(items[0]?.["bookingRef"]).toBe("BR-1");
    expect(items[0]?.["languageGuide"]).toEqual({ type: "GUIDE", language: "en" });
    expect(items[0]?.["bookingQuestionAnswers"]).toHaveLength(1);
  });
});

describe("mapMerchantStatuses", () => {
  it("maps final and transient statuses honestly", () => {
    expect(mapMerchantStatuses(["CONFIRMED"])).toBe("confirmed");
    expect(mapMerchantStatuses(["AMENDED"])).toBe("confirmed");
    expect(mapMerchantStatuses(["PENDING"])).toBe("pending");
    expect(mapMerchantStatuses(["IN_PROGRESS"])).toBe("pending");
    expect(mapMerchantStatuses(["ON_HOLD"])).toBe("pending");
    expect(mapMerchantStatuses(["CANCELED"])).toBe("cancelled");
    expect(mapMerchantStatuses(["CANCELLED"])).toBe("cancelled");
    expect(mapMerchantStatuses(["REJECTED"])).toBe("rejected");
    expect(mapMerchantStatuses(["FAILED"])).toBe("failed");
    expect(mapMerchantStatuses([])).toBe("pending");
  });

  it("a mixed pending+confirmed cart is not treated as confirmed", () => {
    expect(mapMerchantStatuses(["CONFIRMED", "PENDING"])).toBe("pending");
  });
});
