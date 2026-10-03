import { describe, expect, it, vi } from "vitest";
import { roomBasedTotal } from "@/lib/travelshop/catalogue.server";
import { OP_SCOPE, PartnerAuthError, requireScope, hashKey, mintKey } from "../partner-auth.server";
import { CommerceSchemas } from "../commerce.server";

describe("multi-day room pricing (live supplier sng/dbl/trp per person)", () => {
  const p = { unit: 0, adl: 0, chd: 0, inf: 0, sng: 1585, dbl: 1155, trp: 1090 };
  it("matches the supplier's room prices", () => {
    expect(roomBasedTotal(p, 1)).toBe(1585);
    expect(roomBasedTotal(p, 2)).toBe(2310);
    expect(roomBasedTotal(p, 3)).toBe(3270);
    expect(roomBasedTotal(p, 5)).toBe(1090 * 3 + 1155 * 2);
  });
  it("refuses when the needed room price is missing (never guesses)", () => {
    expect(roomBasedTotal({ ...p, sng: 0 }, 1)).toBeNull();
    expect(roomBasedTotal({ ...p, dbl: 0 }, 2)).toBeNull();
  });
});

describe("partner API auth", () => {
  it("hashes keys with the pepper and never stores plaintext", () => {
    vi.stubEnv("PARTNER_KEY_PEPPER", "test-pepper");
    const k = mintKey();
    expect(k.raw).toMatch(/^wwk_live_[A-Za-z0-9_-]{43}$/);
    expect(k.hash).toBe(hashKey(k.raw));
    expect(k.hash).not.toContain(k.raw);
    vi.unstubAllEnvs();
  });
  it("enforces least-privilege scopes per operation", () => {
    const p = {
      tenantId: "t",
      method: "api_key" as const,
      keyId: "k",
      userId: null,
      scopes: ["tours.read" as const],
      apiProducts: ["tours" as const],
      apiAccessMode: "single_product" as const,
      rateLimitPerMinute: 60,
    };
    expect(() => requireScope(p, "searchTours")).not.toThrow();
    expect(() => requireScope(p, "quoteTour")).toThrow(PartnerAuthError);
    expect(OP_SCOPE.planTrip).toBe("trips.plan");
  });
  it("validates inputs strictly", () => {
    expect(CommerceSchemas.quoteTour.safeParse({ tour_id: "x y", date: "2026-10-20", service: "regular", adults: 2 }).success).toBe(false);
    expect(CommerceSchemas.planTrip.safeParse({ origin: "DEL", destination: "IST", depart_date: "2026-10-20", return_date: "2026-10-28", adults: 2 }).success).toBe(true);
  });
});
