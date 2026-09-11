import { describe, expect, it } from "vitest";
import { crystalWorldCruises, crystalWorldCruisesByYear } from "../world-cruises";

describe("Crystal world cruise catalogue", () => {
  const voyages = crystalWorldCruises();

  it("publishes the 2027, 2028 and 2029 world cruises", () => {
    expect(voyages.map((v) => v.departureDate.slice(0, 4))).toEqual(["2027", "2028", "2029"]);
    expect(crystalWorldCruisesByYear([2027])).toHaveLength(1);
  });

  it("carries real itineraries, fares and source attribution", () => {
    for (const v of voyages) {
      expect(v.nights).toBeGreaterThan(100);
      expect(v.itinerary.length).toBeGreaterThan(100);
      expect(v.fares.length).toBeGreaterThan(0);
      expect(v.priceFrom ?? 0).toBeGreaterThan(0);
      expect(v.styles).toContain("world-cruise");
      expect(v.destinationSlug).toBe("world-cruise");
      expect(v.sourceUrl).toMatch(/^https:\/\/www\.crystalcruises\.com\//);
    }
  });

  it("never claims supplier booking capability", () => {
    for (const v of voyages) {
      expect(v.dataSource).toBe("brochure");
      expect(v.bookingMode).toBe("enquiry");
    }
  });
});
