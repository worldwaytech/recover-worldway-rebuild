import { describe, expect, it } from "vitest";
import { resolvePaymentRoute, isViatorHostedRoute } from "@/lib/payments/routing";
import {
  CANONICAL_HOSTING_ORIGIN,
  canSubmitBooking,
  isHoldUsable,
  isTerminalState,
  mapViatorBookingStatus,
  normaliseHostingUrl,
  resolveHostingOrigin,
  sameAmount,
  validateBillingDetails,
  validateBooker,
  validateHoldInput,
} from "@/lib/viator/checkout-contract";

describe("payment routing", () => {
  it("routes a Viator activities-only cart to the hosted iFrame", () => {
    const d = resolvePaymentRoute([
      { supplier: "viator", productKind: "activity" },
      { supplier: "Viator", productKind: "ACTIVITY" },
    ]);
    expect(d.route).toBe("VIATOR_HOSTED_IFRAME");
    expect(d.reason).toBe("viator_activities_only");
  });

  it("keeps mixed carts on the existing orchestrator", () => {
    expect(
      resolvePaymentRoute([
        { supplier: "viator", productKind: "activity" },
        { supplier: "up17", productKind: "flight" },
      ]),
    ).toEqual({ route: "EXISTING_PAYMENT_ORCHESTRATOR", reason: "mixed_supplier_cart" });
  });

  it.each([
    "flight",
    "hotel",
    "transfer",
    "bus",
    "private_jet",
    "cruise",
    "rail",
    "membership",
    "wallet_topup",
    "tour",
  ])("never routes %s through Viator payments", (kind) => {
    expect(isViatorHostedRoute([{ supplier: "up17", productKind: kind }])).toBe(false);
  });

  it("fails closed on an empty cart", () => {
    expect(resolvePaymentRoute([]).route).toBe("EXISTING_PAYMENT_ORCHESTRATOR");
  });

  it("does not route non-activity Viator products to the iFrame", () => {
    expect(isViatorHostedRoute([{ supplier: "viator", productKind: "tour" }])).toBe(false);
  });
});

describe("hostingUrl", () => {
  it("reduces any URL to its origin", () => {
    expect(normaliseHostingUrl("https://www.worldwaytravelsgroup.com/activities/1234")).toBe(
      "https://www.worldwaytravelsgroup.com",
    );
  });
  it("rejects non-https hosts", () => {
    expect(() => normaliseHostingUrl("http://example.com")).toThrow();
  });
});

describe("resolveHostingOrigin (allowlist)", () => {
  it("uses the www production origin when the page is on www", () => {
    expect(resolveHostingOrigin({ originHeader: "https://www.worldwaytravelsgroup.com" })).toBe(
      "https://www.worldwaytravelsgroup.com",
    );
  });
  it("uses the apex origin when the page is on the apex domain (no www rewrite)", () => {
    expect(
      resolveHostingOrigin({
        originHeader: "https://worldwaytravelsgroup.com",
        configuredUrl: "https://www.worldwaytravelsgroup.com",
      }),
    ).toBe("https://worldwaytravelsgroup.com");
  });
  it("falls back to Referer when Origin is absent", () => {
    expect(
      resolveHostingOrigin({
        refererHeader: "https://www.worldwaytravelsgroup.com/activities/5010SYDNEY#book",
      }),
    ).toBe("https://www.worldwaytravelsgroup.com");
  });
  it("allows published and preview Lovable hosts", () => {
    expect(resolveHostingOrigin({ originHeader: "https://recover-worldway-rebuild.lovable.app" })).toBe(
      "https://recover-worldway-rebuild.lovable.app",
    );
    expect(
      resolveHostingOrigin({
        originHeader: "https://id-preview--1efb52bc-177b-40a1-a064-649c8874fa6d.lovable.app",
      }),
    ).toBe("https://id-preview--1efb52bc-177b-40a1-a064-649c8874fa6d.lovable.app");
  });
  it("never echoes an arbitrary or spoofed origin to the supplier", () => {
    expect(resolveHostingOrigin({ originHeader: "https://evil.example.com" })).toBe(
      CANONICAL_HOSTING_ORIGIN,
    );
    expect(resolveHostingOrigin({ originHeader: "https://worldwaytravelsgroup.com.evil.io" })).toBe(
      CANONICAL_HOSTING_ORIGIN,
    );
    expect(resolveHostingOrigin({ originHeader: "http://www.worldwaytravelsgroup.com" })).toBe(
      CANONICAL_HOSTING_ORIGIN,
    );
    expect(resolveHostingOrigin({ originHeader: "null" })).toBe(CANONICAL_HOSTING_ORIGIN);
  });
  it("honours a configured VIATOR_HOSTING_URL as the fallback and as an allowed origin", () => {
    expect(resolveHostingOrigin({ configuredUrl: "https://book.worldwaytravelsgroup.com/x" })).toBe(
      "https://book.worldwaytravelsgroup.com",
    );
    expect(
      resolveHostingOrigin({
        originHeader: "https://book.worldwaytravelsgroup.com",
        configuredUrl: "https://book.worldwaytravelsgroup.com",
      }),
    ).toBe("https://book.worldwaytravelsgroup.com");
  });
  it("ignores an invalid configured URL and falls back to canonical", () => {
    expect(resolveHostingOrigin({ configuredUrl: "not a url" })).toBe(CANONICAL_HOSTING_ORIGIN);
  });
});

describe("hold input validation", () => {
  const base = {
    productCode: "5657LON_A",
    travelDate: "2026-05-01",
    currency: "usd",
    paxMix: [{ ageBand: "ADULT" as const, count: 2 }],
  };
  it("normalises currency and drops empty bands", () => {
    const out = validateHoldInput({
      ...base,
      paxMix: [
        { ageBand: "ADULT", count: 2 },
        { ageBand: "CHILD", count: 0 },
      ],
    });
    expect(out.currency).toBe("USD");
    expect(out.paxMix).toHaveLength(1);
  });
  it("requires an adult", () => {
    expect(() => validateHoldInput({ ...base, paxMix: [{ ageBand: "CHILD", count: 2 }] })).toThrow(
      /adult/i,
    );
  });
  it("rejects bad dates and codes", () => {
    expect(() => validateHoldInput({ ...base, travelDate: "01/05/2026" })).toThrow();
    expect(() => validateHoldInput({ ...base, productCode: "no spaces!" })).toThrow();
  });
});

describe("billing + booker validation", () => {
  it("uppercases the ISO country", () => {
    expect(validateBillingDetails({ country: "gb", postalCode: " sw1a 1aa " })).toEqual({
      country: "GB",
      postalCode: "sw1a 1aa",
    });
  });
  it("rejects invalid country and postal codes", () => {
    expect(() => validateBillingDetails({ country: "USA", postalCode: "12345" })).toThrow();
    expect(() => validateBillingDetails({ country: "US", postalCode: "!!" })).toThrow();
  });
  it("requires a valid booker email", () => {
    expect(() =>
      validateBooker({
        firstName: "A",
        lastName: "B",
        email: "not-an-email",
        phone: "+971501234567",
      }),
    ).toThrow();
    expect(
      validateBooker({
        firstName: " Ada ",
        lastName: "L",
        email: "A@B.CO",
        phone: "+971 50 123 4567",
      }).email,
    ).toBe("a@b.co");
  });
  // Viator requires communication.phone in international format for booking.
  it("requires a phone number in international format", () => {
    expect(() => validateBooker({ firstName: "A", lastName: "B", email: "a@b.co" })).toThrow();
    expect(() =>
      validateBooker({ firstName: "A", lastName: "B", email: "a@b.co", phone: "0501234567" }),
    ).toThrow();
    expect(
      validateBooker({ firstName: "A", lastName: "B", email: "a@b.co", phone: "+971501234567" })
        .phone,
    ).toBe("+971501234567");
  });
});

describe("supplier status mapping", () => {
  it("maps confirmed", () => {
    expect(mapViatorBookingStatus(["CONFIRMED"])).toBe("confirmed");
  });
  it("treats any failure as failed", () => {
    expect(mapViatorBookingStatus(["CONFIRMED", "FAILED"])).toBe("failed");
  });
  it("maps rejection", () => {
    expect(mapViatorBookingStatus(["REJECTED"])).toBe("rejected");
  });
  it("maps pending", () => {
    expect(mapViatorBookingStatus(["PENDING"])).toBe("paid_pending_confirmation");
  });
  it("empty status is a failure, never a silent success", () => {
    expect(mapViatorBookingStatus([])).toBe("failed");
  });
});

describe("hold expiry + idempotency gate", () => {
  it("treats an expired hold as unusable", () => {
    expect(isHoldUsable(new Date(Date.now() - 1000).toISOString())).toBe(false);
    expect(isHoldUsable(new Date(Date.now() + 600_000).toISOString())).toBe(true);
  });

  it("never re-books a confirmed cart", () => {
    expect(canSubmitBooking({ state: "confirmed" })).toEqual({
      ok: false,
      reason: "This booking is already confirmed.",
    });
  });

  it("never re-books a cart awaiting confirmation", () => {
    expect(canSubmitBooking({ state: "paid_pending_confirmation" }).ok).toBe(false);
  });

  it("blocks a rejected or expired cart", () => {
    expect(canSubmitBooking({ state: "rejected" }).ok).toBe(false);
    expect(
      canSubmitBooking({
        state: "held",
        holdExpiresAt: new Date(Date.now() - 5000).toISOString(),
      }).ok,
    ).toBe(false);
  });

  it("allows a live hold exactly once", () => {
    expect(
      canSubmitBooking({
        state: "held",
        holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    ).toEqual({ ok: true });
  });

  it("marks confirmed/rejected/expired as terminal", () => {
    expect(isTerminalState("confirmed")).toBe(true);
    expect(isTerminalState("rejected")).toBe(true);
    expect(isTerminalState("held")).toBe(false);
  });
});

describe("amount comparison", () => {
  it("is cent-safe", () => {
    expect(sameAmount(120.0, 120.005)).toBe(true);
    expect(sameAmount(120.0, 121.0)).toBe(false);
  });
});
