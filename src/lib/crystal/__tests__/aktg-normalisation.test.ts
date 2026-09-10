import { describe, expect, it } from "vitest";
import { fareFromAvailability, mapSuiteCategory, normaliseAktgVoyage } from "../aktg.server";

const product = {
  voyageID: 224585,
  voyageNumber: "CSY-007-260817",
  title: "Vancouver to San Diego",
  ship: "Crystal Symphony",
  shipCod: "CSY",
  embarkDate: "2026-08-17T00:00:00",
  debarkDate: "2026-08-24T00:00:00",
  duration: 7,
  embarkPortCod: "VAN",
  embarkPort: "Vancouver",
  debarkPortCod: "SAN",
  debarkPort: "San Diego",
  voyageType: "Ocean",
  voyageDescription: "<p>Sail the <b>Pacific</b> coast.</p>",
  image1: "https://example.com/ecm/San Francisco, California hero.jpg",
  mapSVG: "https://example.com/maps/224585.svg",
  itineraries: [
    { pos: 2, day: 2, cityName: "At sea", itineraryDate: "2026-08-18T00:00:00" },
    {
      pos: 1,
      day: 1,
      cityName: "Vancouver",
      country: "Canada",
      itineraryDate: "2026-08-17T00:00:00",
      departTime: "17:00:00",
      dressCode: "Casual",
    },
  ],
};

describe("Crystal AKTG normalisation", () => {
  it("maps suite categories from supplier labels", () => {
    expect(mapSuiteCategory("Crystal Penthouse Suite", "CHV4")).toBe("penthouse");
    expect(mapSuiteCategory("Owner's Residence", "RES")).toBe("residence");
    expect(mapSuiteCategory("Deluxe Veranda Suite", "DV")).toBe("balcony");
    expect(mapSuiteCategory("Sea View Suite", "SV")).toBe("ocean-view");
  });

  it("builds a voyage with itinerary, media and commercial terms", () => {
    const voyage = normaliseAktgVoyage(
      product,
      {
        fares: [
          {
            suiteCategory: "balcony",
            gradeId: "DV",
            gradeName: "Deluxe Veranda Suite",
            price: 5200,
            currency: "USD",
            fareType: "FIT Regular Fare",
            availabilityLabel: "Available",
            available: true,
          },
        ],
        paymentSchedule: {
          optionPerc: 25,
          optionDueDate: "2026-03-01T00:00:00",
          finalPaymentDate: "2026-05-16T00:00:00",
        },
        penalties: [{ daysFrom: 90, daysTo: 120, amountPerc: 25 }],
        promotionNames: ["Book Now Savings"],
      },
      "USD",
    );

    expect(voyage).not.toBeNull();
    expect(voyage!.code).toBe("CSY-007-260817");
    expect(voyage!.nights).toBe(7);
    expect(voyage!.departureDate).toBe("2026-08-17");
    expect(voyage!.returnDate).toBe("2026-08-24");
    expect(voyage!.shipSlug).toBe("crystal-symphony");
    // itinerary is ordered by supplier position
    expect(voyage!.itinerary.map((d) => d.port)).toEqual(["Vancouver", "At sea"]);
    expect(voyage!.itinerary[0]!.depart).toBe("17:00");
    // description is de-HTMLed
    expect(voyage!.description).toBe("Sail the Pacific coast.");
    // media URLs with spaces are encoded so browsers can load them
    expect(voyage!.media.hero).toContain("San%20Francisco");
    expect(voyage!.media.mapSvg).toBe("https://example.com/maps/224585.svg");
    expect(voyage!.priceFrom).toBe(5200);
    expect(voyage!.availability).toBe("open");
    expect(voyage!.depositPercent).toBe(25);
    expect(voyage!.depositDueDate).toBe("2026-03-01");
    expect(voyage!.finalPaymentDate).toBe("2026-05-16");
    expect(voyage!.cancellationPolicy).toEqual([
      { daysFrom: 90, daysTo: 120, amountPercent: 25, fixedAmount: undefined },
    ]);
    expect(voyage!.dataSource).toBe("licensed");
    expect(voyage!.destinationSlug).toBeTruthy();
  });

  it("rejects records without a voyage number or sail date", () => {
    const empty = { fares: [], penalties: [], promotionNames: [] };
    expect(normaliseAktgVoyage({ ...product, voyageNumber: "" }, empty, "USD")).toBeNull();
    expect(normaliseAktgVoyage({ ...product, embarkDate: null }, empty, "USD")).toBeNull();
  });

  it("derives live suite counts from the availability operation", () => {
    const fare = fareFromAvailability(
      {
        voyageNumber: "CSY-007-260817",
        category: "DV - Deluxe Veranda Suite",
        categoryCod: "DV",
        priceDouble: 5400,
        priceSingle: 9900,
        portCharge: 800,
        totAV: 3,
        totGTY: 2,
        currency: "EUR",
        isSellableFromWeb: "Y",
        priceTypeName: "FIT Regular Fare",
      },
      "USD",
    );
    expect(fare.price).toBe(5400);
    expect(fare.currency).toBe("EUR");
    expect(fare.available).toBe(true);
    expect(fare.availabilityCount).toBe(5);
    expect(fare.guaranteeCount).toBe(2);
    expect(fare.sellableOnline).toBe(true);
    expect(fare.availabilityLabel).toBe("5 suites available");

    const sold = fareFromAvailability(
      { category: "SV", categoryCod: "SV", priceDouble: 3200, totAV: 0, totGTY: 0 },
      "USD",
    );
    expect(sold.available).toBe(false);
    expect(sold.availabilityLabel).toBe("Waitlist");
  });
});
