import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/lib/airiq/client.server", () => ({ WORLDWAY_MARKUP_PERCENT: 5 }));
vi.mock("@/lib/ratehawk/hotels.server", () => ({ worldwayPricingConfig: () => ({ markupPercent: 8, serviceFeePercent: 0, fixedFee: 0 }) }));
import { commercialRuleFor, commercialCoverage } from "../suppliers/commercial.server";
import { __resetFxCache, approvedFx, crossRates, isStale } from "../suppliers/fx.server";
import { priceComponent } from "../pricing";

describe("approved Worldway commercial rules", () => {
  it("applies initial markups with 0% commission (no double count)", () => {
    expect(commercialRuleFor({ supplierKey: "crystal" })).toEqual({ markupPercent: 10, commissionPercent: 0, serviceFee: 0 });
    expect(commercialRuleFor({ supplierKey: "up17" })?.markupPercent).toBe(5);
    expect(commercialRuleFor({ supplierKey: "viator-affiliate" })?.markupPercent).toBe(12);
    expect(commercialRuleFor({ supplierKey: "hbx-hotels" })?.markupPercent).toBe(10);
    expect(commercialRuleFor({ supplierKey: "airiq" })?.markupPercent).toBe(5);
  });
  it("never falls back to 0% for unknown suppliers", () => {
    expect(commercialRuleFor({ supplierKey: "future-supplier" })).toBeNull();
    expect(commercialRuleFor({ supplierKey: "amadeus" })).toBeNull();
    expect(commercialCoverage(["gadventures"])[0]!.source).toBeNull();
  });
  it("prices markup exactly once", () => {
    const p = priceComponent({ id: "c", supplierKey: "up17", net: { amount: 1000, currency: "INR" }, taxes: { amount: 0, currency: "INR" } } as any, "INR", { INR: 1 }, commercialRuleFor({ supplierKey: "up17" })!);
    expect(p.customerPrice).toBe(1050);
  });
});

describe("Open Exchange Rates FX", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("derives cross rates from the USD table", () => {
    expect(crossRates({ USD: 1, INR: 83, EUR: 0.9 }, "INR", ["USD", "EUR"])).toEqual({ INR: 1, USD: 83, EUR: 83 / 0.9 });
  });
  it("flags stale provider rates", () => {
    expect(isStale(Date.now() / 1000 - 7 * 3600)).toBe(true);
    expect(isStale(Date.now() / 1000 - 60)).toBe(false);
  });
  it("fails safely when every live provider fails (identity only, never a guessed rate)", async () => {
    __resetFxCache();
    vi.stubEnv("OPEN_EXCHANGE_RATES_APP_ID", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const r = await approvedFx("INR", ["USD"]);
    expect(r.table).toEqual({ INR: 1 });
    expect(r.audit.error).toMatch(/unavailable/);
  });
  it("falls back to the keyless ECB feed and records source + timestamp", async () => {
    __resetFxCache();
    vi.stubEnv("OPEN_EXCHANGE_RATES_APP_ID", "");
    const today = new Date().toISOString().slice(0, 10);
    vi.stubGlobal("fetch", vi.fn(async (u: string) => String(u).includes("frankfurter")
      ? Response.json({ base: "USD", date: today, rates: { INR: 96, EUR: 0.8 } })
      : new Response("x", { status: 500 })));
    const r = await approvedFx("INR", ["EUR"]);
    expect(r.source).toBe("frankfurter-ecb");
    expect(r.table.EUR).toBeCloseTo(120);
    expect(r.audit.ratesAt).toContain(today);
  });
});
