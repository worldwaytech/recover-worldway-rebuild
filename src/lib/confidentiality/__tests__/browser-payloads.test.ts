import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { restoreInbound, sanitizeOutbound, SEAL_KEY } from "../guard.server";
import { findSupplierLeaks, supplierTerms } from "../redact";
import { PARTNER_CONNECTORS } from "@/lib/partners/registry";

// Representative browser payloads for every product family (shapes mirror the
// real server-function responses). Leak detection is registry-driven, so any
// future supplier is covered automatically.
const FIXTURES: Record<string, unknown> = {
  hotels: { hotels: [{ name: "Taj Palace", supplier: "HBX", source: "Hotelbeds", rateKey: "20261015|20261016|W|1|123", hotelCode: "123", image: "https://photos.hotelbeds.com/giata/1.jpg", searchTokenId: "abc-123", resultIndex: 7 }] },
  flights: { offers: [{ airline: "Air India", resultIndex: "OB12", fares: [{ fareId: "F1", source: "UP17", price: 5820 }] }] },
  buses: { buses: [{ operator: "VRL Travels", source: "TBO", resultIndex: 3, provider: "UP17" }] },
  prePurchased: { fares: [{ ticketId: 99812, provider: "AIR iQ", airline: "IndiGo" }] },
  activities: { product: { title: "Sydney Harbour Cruise", affiliateUrl: "https://www.viator.com/tours/x?pid=P1", reviews: [{ provider: "TRIPADVISOR", rating: 5, text: "Great" }] } },
  transfers: { outbound: [{ rateKey: "RK|1", supplierName: "Hotelbeds", supplierTimes: [{ type: "X", value: "10", metric: "min", remarks: "Meet at door" }] }] },
  cabs: { quotes: [{ vendorId: "V12", vendorName: "TripJack Cabs", price: 1200 }] },
  protection: { plans: [{ title: "Travel Protection", providerName: "TripSafe", supplierPlanId: "TS-1" }] },
  tours: { tours: [{ title: "Best of Italy", brand: "contiki", brandLabel: "Contiki", operatorName: "The Travel Corporation", raw: { secret: 1 } }] },
  journeys: { journeys: [{ title: "Kenya Safari", partnerName: "Abercrombie & Kent", partnerId: "aktg", sourceUrl: "https://www.abercrombiekent.com/j/1" }] },
  cruises: { voyages: [{ ship: "Crystal Serenity", supplierReference: "475465", note: "Sold by Crystal Cruises" }] },
  aviation: { legs: [{ aircraft: "Citation XLS", supplier: "Villiers", affiliateLink: "https://villiers.ai/x" }] },
  wallet: { entries: [{ supplier: "hotels", kind: "spend", amount: 10 }] },
};

describe("browser payload privacy guard", () => {
  it("leaves no supplier names, ids, codes or metadata in any product payload", async () => {
    for (const [product, payload] of Object.entries(FIXTURES)) {
      const safe = await sanitizeOutbound(payload);
      const json = JSON.stringify(safe);
      // Only the contractual review attribution may remain.
      const leaks = findSupplierLeaks(JSON.parse(json.replace(/"provider":"TRIPADVISOR"/g, '"provider":"x"')))
        .filter((p) => !SEAL_KEY.test(p.split(".").pop() ?? ""));
      expect(leaks, product).toEqual([]);
      for (const t of supplierTerms()) {
        if (t.length < 4 || /^(tripadvisor)$/i.test(t)) continue;
        expect(new RegExp(`(?<![\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(json), `${product}:${t}`).toBe(false);
      }
      expect(json, product).not.toMatch(/hotelbeds\.com|viator\.com|abercrombiekent\.com|villiers\.ai/i);
      expect(json).not.toContain('"raw"');
    }
  });

  it("round-trips booking-critical references exactly", async () => {
    const safe = (await sanitizeOutbound(FIXTURES.hotels)) as { hotels: Record<string, unknown>[] };
    const h = safe.hotels[0]!;
    expect(String(h.rateKey)).toMatch(/^wwr_/);
    const back = (await restoreInbound({ rateKey: h.rateKey, resultIndex: h.resultIndex, searchTokenId: h.searchTokenId })) as Record<string, unknown>;
    expect(back).toEqual({ rateKey: "20261015|20261016|W|1|123", resultIndex: 7, searchTokenId: "abc-123" });
  });

  it("is deterministic so filters/equality still work", async () => {
    const a = (await sanitizeOutbound({ source: "UP17" })) as { source: string };
    const b = (await sanitizeOutbound({ source: "UP17" })) as { source: string };
    expect(a.source).toBe(b.source);
  });

  it("rejects forged references", async () => {
    expect(await restoreInbound({ rateKey: "wwr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).toEqual({
      rateKey: "wwr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
  });

  it("keeps the contractual review attribution, neutral categories and operational remarks", async () => {
    const act = (await sanitizeOutbound(FIXTURES.activities)) as { product: { reviews: { provider: string }[]; affiliateUrl: string } };
    expect(act.product.reviews[0]!.provider).toBe("TRIPADVISOR");
    expect(act.product.affiliateUrl).toMatch(/^\/go\/wwr_/);
    const w = (await sanitizeOutbound(FIXTURES.wallet)) as { entries: { supplier: string }[] };
    expect(w.entries[0]!.supplier).toBe("hotels");
    const t = (await sanitizeOutbound(FIXTURES.transfers)) as { outbound: { supplierTimes: { remarks: string }[] }[] };
    expect(t.outbound[0]!.supplierTimes[0]!.remarks).toBe("Meet at door");
  });

  it("keeps real ship names", async () => {
    const c = (await sanitizeOutbound(FIXTURES.cruises)) as { voyages: { ship: string; note: string }[] };
    expect(c.voyages[0]!.ship).toBe("Crystal Serenity");
    expect(c.voyages[0]!.note).not.toMatch(/Crystal Cruises/);
  });

  it("covers every registered (and future) supplier name automatically", async () => {
    for (const c of PARTNER_CONNECTORS) {
      if (!c.name || /^worldway$/i.test(c.name)) continue;
      const safe = await sanitizeOutbound({ title: `Offered by ${c.name}` });
      expect(findSupplierLeaks(safe), c.name).toEqual([]);
    }
  });

  it("is registered globally for every server function", () => {
    const start = readFileSync("src/start.ts", "utf8");
    expect(start).toMatch(/functionMiddleware:\s*\[[^\]]*supplierPrivacyMiddleware/);
  });

  it("MCP tools sanitize before responding", () => {
    for (const f of ["search-flights", "search-hotels", "wallet-balance", "wallet-transactions"]) {
      expect(readFileSync(`src/lib/mcp/tools/${f}.ts`, "utf8"), f).toContain("sanitizeOutbound");
    }
  });
});
