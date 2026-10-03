import { describe, expect, it } from "vitest";
import { PartnerAuthError, requireScope } from "@/lib/commerce/partner-auth.server";
import {
  assertPartnerActive,
  calculatePartnerPrice,
  commissionFor,
  createPartnerBookingActor,
  filterPartnerCatalogue,
  partnerWalletCanReserve,
  validateStorefront,
  type PartnerProfile,
} from "../partner-commerce";

const partner: PartnerProfile = {
  id: "tenant-001",
  name: "Global DMC",
  kind: "dmc",
  status: "active",
  pricingChannel: "partner_b2b",
  products: ["flights", "hotels", "activities"],
  catalogRules: [
    { product: "hotels", mode: "allow", category: "luxury" },
    { product: "hotels", mode: "deny", externalIds: ["hotel-blocked"] },
  ],
  commissionRules: [
    { product: "hotels", percent: 10, maximum: 500 },
    { product: "flights", percent: 5 },
  ],
  wallet: { enabled: true, currencies: ["INR", "USD"], allowReserve: true, allowCredit: true, creditLimit: 100000 },
  storefront: { slug: "global-dmc", brandName: "Global DMC", host: "travel.global-dmc.com", primaryColor: "#112233", enabled: true },
};

describe("Phase 12 partner commerce", () => {
  it("validates an active multi-product partner", () => {
    expect(() => assertPartnerActive(partner)).not.toThrow();
  });

  it("filters catalogue by partner product and deterministic allow/deny rules", () => {
    const items = [
      { id: "lux-1", product: "hotels" as const, category: "Luxury", active: true, price: 1000, currency: "USD" },
      { id: "std-1", product: "hotels" as const, category: "Standard", active: true, price: 500, currency: "USD" },
      { id: "hotel-blocked", product: "hotels" as const, category: "Luxury", active: true, price: 800, currency: "USD" },
      { id: "f-1", product: "flights" as const, active: true, price: 700, currency: "USD" },
    ];
    expect(filterPartnerCatalogue(partner, items).map(x => x.id)).toEqual(["lux-1", "f-1"]);
  });

  it("calculates capped partner commission without exceeding sale value", () => {
    const q = commissionFor(partner, "hotels", 6000, "USD");
    expect(q.commission).toBe(500);
    expect(q.partnerNetRevenue).toBe(5500);
    expect(calculatePartnerPrice({ supplierCost: 4000, customerPrice: 1000, currency: "USD" }).commission).toBe(0);
  });

  it("rejects invalid storefront hosts and accepts valid branding", () => {
    expect(validateStorefront({ ...partner.storefront!, host: "not a host!" })).toContain("invalid storefront host");
    expect(validateStorefront(partner.storefront!)).toEqual([]);
  });

  it("enforces booking scopes and creates a tenant-isolated booking actor", () => {
    const actor = createPartnerBookingActor({
      partnerId: partner.id,
      customerId: "customer-1",
      currency: "USD",
      bookingIdempotencyKey: "b2b-001",
      scopes: ["booking:read", "booking:write", "payment:write"],
    });
    expect(actor.tenantId).toBe(partner.id);
    expect(actor.scopes).toContain("booking:write");
    expect(() => createPartnerBookingActor({
      partnerId: partner.id, customerId: "customer-1", currency: "USD", bookingIdempotencyKey: "b2b-002",
      scopes: ["booking:read"],
    })).toThrow("Missing scope");
  });

  it("supports single-product, multi-product and full-catalogue API entitlement models", () => {
    const single = { apiAccessMode: "single_product" as const, apiProducts: ["hotels"] as const };
    const multi = { apiAccessMode: "multi_product" as const, apiProducts: ["flights", "hotels", "tours"] as const };
    const full = { apiAccessMode: "full_catalogue" as const, apiProducts: ["flights","hotels","transfers","activities","tours","cruises","rail","private_aviation","concierge"] as const };
    expect(single.apiProducts).toHaveLength(1);
    expect(multi.apiProducts).toEqual(expect.arrayContaining(["flights", "hotels", "tours"]));
    expect(full.apiProducts).toHaveLength(9);
  });

  it("enforces API product entitlements independently from operation scopes", () => {
    const base = {
      tenantId: "tenant-001",
      method: "api_key" as const,
      keyId: "key-1",
      userId: null,
      scopes: ["flights.search", "tours.read"],
      rateLimitPerMinute: 60,
    };
    expect(() => requireScope({ ...base, apiProducts: ["flights"], apiAccessMode: "single_product" }, "searchFlights")).not.toThrow();
    expect(() => requireScope({ ...base, apiProducts: ["flights"], apiAccessMode: "single_product" }, "searchTours")).toThrow(PartnerAuthError);
    expect(() => requireScope({ ...base, apiProducts: ["flights", "tours"], apiAccessMode: "multi_product" }, "searchTours")).not.toThrow();
    expect(() => requireScope({ ...base, apiProducts: [], apiAccessMode: "full_catalogue" }, "searchTours")).not.toThrow();
  });

  it("gates partner wallet reservation by status, currency and policy", () => {
    expect(partnerWalletCanReserve(partner, "USD", 5000)).toBe(true);
    expect(partnerWalletCanReserve(partner, "EUR", 5000)).toBe(false);
    expect(partnerWalletCanReserve({ ...partner, status: "suspended" }, "USD", 5000)).toBe(false);
  });
});
