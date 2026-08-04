import { describe, it, expect } from "vitest";
import { toPartnerHotelPayload } from "@/lib/wwl.functions";

// Regression tests for the certified hotel-payload compatibility layer.
// If any of these fail, the upstream partner contract or the UI contract has
// drifted — reconcile carefully and DO NOT weaken the mapping.
describe("toPartnerHotelPayload", () => {
  it("maps snake_case UI fields to upstream camelCase fields", () => {
    const out = toPartnerHotelPayload({
      destination: "Dubai",
      check_in: "2026-08-01",
      check_out: "2026-08-05",
      guests: 2,
      rooms: 1,
    });
    expect(out.destination).toBe("Dubai");
    expect(out.checkIn).toBe("2026-08-01");
    expect(out.checkOut).toBe("2026-08-05");
    expect(Array.isArray(out.rooms)).toBe(true);
    expect(out.rooms).toEqual([{ adults: 2 }]);
  });

  it("splits guests across the requested number of rooms", () => {
    const out = toPartnerHotelPayload({
      destination: "Rome",
      check_in: "2026-09-10",
      check_out: "2026-09-14",
      guests: 4,
      rooms: 2,
    });
    expect(out.rooms).toHaveLength(2);
    expect(out.rooms).toEqual([{ adults: 2 }, { adults: 2 }]);
  });

  it("defaults to 1 room / 2 adults when the UI omits them", () => {
    const out = toPartnerHotelPayload({
      destination: "Bali",
      check_in: "2026-10-01",
      check_out: "2026-10-05",
    });
    expect(out.rooms).toEqual([{ adults: 2 }]);
  });

  it("never emits legacy snake_case keys on the outbound payload", () => {
    const out = toPartnerHotelPayload({
      destination: "Paris",
      check_in: "2026-11-01",
      check_out: "2026-11-05",
      guests: 3,
      rooms: 1,
    }) as Record<string, unknown>;
    expect(out.check_in).toBeUndefined();
    expect(out.check_out).toBeUndefined();
    expect(typeof out.rooms === "number").toBe(false);
  });
});
