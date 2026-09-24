import { describe, expect, it } from "vitest";
import { mapActivity, parseActiveIds } from "../sync.server";

describe("Bókun marketplace sync mapping", () => {
  it("parses SellableActivities and drops malformed ids", () => {
    const r = parseActiveIds({ suppliers: [{ supplierId: 147354, activityIds: [1, 2, "x"] }, { supplierId: "bad" }] });
    expect(r).toEqual([{ supplierId: "147354", activityIds: ["1", "2"] }]);
    expect(parseActiveIds(null)).toEqual([]);
  });
  it("maps ActivityDto content, photos, price and cancellation rules", () => {
    const m = mapActivity({
      id: 9, title: "Glacier walk", excerpt: "Ice", vendor: { id: 55, title: "Op" },
      googlePlace: { city: "Vik", country: "IS" }, nextDefaultPriceMoney: { amount: 100, currency: "EUR" },
      keyPhoto: { derived: [{ name: "large", url: "https://a/1.jpg" }] }, photos: [{ originalUrl: "https://a/1.jpg" }, { originalUrl: "https://a/2.jpg" }],
      cancellationPolicy: { id: 3, title: "24h", penaltyRules: [{ cutoffHours: 24 }] },
    }, "147354");
    expect(m.product_id).toBe("9");
    expect(m.supplier_id).toBe("55");
    expect(m.photos).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(m.price_from).toBe(100);
    expect(m.cancellation_policy?.title).toBe("24h");
    expect(m.fingerprint).toHaveLength(64);
    expect(mapActivity({ id: 9, title: "Glacier walk" }, null).fingerprint).not.toBe(m.fingerprint);
  });
  it("fingerprint is stable for identical content", () => {
    expect(mapActivity({ id: 1, title: "A" }, "1").fingerprint).toBe(mapActivity({ id: 1, title: "A" }, "1").fingerprint);
  });
});
