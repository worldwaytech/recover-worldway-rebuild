import { describe, expect, it } from "vitest";
import {
  CRUISEA_DURATIONS,
  durationMatches,
  formatCruiseaDate,
  formatCruiseaMoney,
} from "../types";

describe("cruisea duration bands", () => {
  it("accepts any duration when no band is chosen", () => {
    expect(durationMatches(10)).toBe(true);
  });

  it("matches nights inside the chosen band only", () => {
    expect(durationMatches(3, "1-5")).toBe(true);
    expect(durationMatches(7, "1-5")).toBe(false);
    expect(durationMatches(7, "6-8")).toBe(true);
    expect(durationMatches(11, "9-12")).toBe(true);
    expect(durationMatches(14, "13+")).toBe(true);
  });

  it("covers every night count with contiguous bands", () => {
    for (let nights = 1; nights <= 30; nights += 1) {
      const bands = CRUISEA_DURATIONS.filter((b) => nights >= b.min && nights <= b.max);
      expect(bands).toHaveLength(1);
    }
  });

  it("ignores an unknown band rather than hiding results", () => {
    expect(durationMatches(9, "nonsense")).toBe(true);
  });
});

describe("cruisea formatting", () => {
  it("formats prices without cents", () => {
    expect(formatCruiseaMoney(1299)).toBe("$1,299");
  });

  it("formats departure dates in UTC", () => {
    expect(formatCruiseaDate("2027-05-15")).toBe("15 May 2027");
  });

  it("returns the raw value for an unparsable date", () => {
    expect(formatCruiseaDate("not-a-date")).toBe("not-a-date");
  });
});
