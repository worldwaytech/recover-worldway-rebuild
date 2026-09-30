import { describe, expect, it } from "vitest";
import { hotelWindowsExcluding, stayPlanAroundTour, tourFitsTrip, tourIncludesAccommodation } from "../tour-stays";
import { localDateIn, localToInstant } from "../suppliers/live-search.server";

describe("multi-day tours and hotels", () => {
  it("detects accommodation only on multi-day tours whose inclusions contain it", () => {
    expect(tourIncludesAccommodation(["Accommodation", "Guide"], 4)).toBe(true);
    expect(tourIncludesAccommodation(["Guide", "Transport"], 4)).toBe(false);
    expect(tourIncludesAccommodation(["Accommodation"], 1)).toBe(false);
    expect(tourIncludesAccommodation(["Hotel not included"], 3)).toBe(false);
  });

  it("dates start on the actual (next-day) arrival date in the destination zone", () => {
    const arrival = localToInstant("2026-10-01 06:10", "Europe/Istanbul")!; // departed 30-09
    const arrivalDate = localDateIn(arrival, "Europe/Istanbul");
    expect(arrivalDate).toBe("2026-10-01");
    expect(tourFitsTrip("2026-09-30", "2026-10-03", arrivalDate, "2026-10-08")).toBe(false);
    expect(tourFitsTrip("2026-10-02", "2026-10-05", arrivalDate, "2026-10-08")).toBe(true);
    expect(tourFitsTrip("2026-10-06", "2026-10-09", arrivalDate, "2026-10-08")).toBe(false);
  });

  it("pre/post hotels are optional windows and tour nights are never duplicated", () => {
    const p = stayPlanAroundTour({ arrivalDate: "2026-10-01", departureDate: "2026-10-08", tourStart: "2026-10-02", tourEnd: "2026-10-05", accommodationIncluded: true });
    expect(p.optionalPre).toEqual({ checkin: "2026-10-01", checkout: "2026-10-02" });
    expect(p.optionalPost).toEqual({ checkin: "2026-10-05", checkout: "2026-10-08" });
    expect(hotelWindowsExcluding({ checkin: "2026-10-01", checkout: "2026-10-08" }, p.tourNights)).toEqual([
      { checkin: "2026-10-01", checkout: "2026-10-02" }, { checkin: "2026-10-05", checkout: "2026-10-08" },
    ]);
    expect(stayPlanAroundTour({ arrivalDate: "2026-10-01", departureDate: "2026-10-08", tourStart: "2026-10-02", tourEnd: "2026-10-05", accommodationIncluded: false }).optionalPre).toBeNull();
  });
});
