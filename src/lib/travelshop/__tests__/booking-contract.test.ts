import { describe, expect, it } from "vitest";
import { bookingGates, buildNewBookingBody, contractComplete } from "../booking-contract";

const rec = {
  tour_external_id: 42, tour_date: "2099-01-10", service_type: "regular", adults: 2, children: 0, infants: 0, rooms: {},
  supplier_currency: "EUR", lead_traveller: { firstName: "A", lastName: "B", email: "a@b.co", phone: "9999999999", phoneCountryCode: "91" },
};

describe("tour booking contract", () => {
  it("blocks while partner phone country ids are unknown (never guesses)", () => {
    const r = buildNewBookingBody(rec as never, "2026-09-30");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers.join(" ")).toMatch(/country id/);
  });
  it("blocks room-priced tours and past dates", () => {
    const r = buildNewBookingBody({ ...rec, tour_date: "2020-01-01", rooms: { double: 1 } } as never, "2026-09-30");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers.length).toBeGreaterThanOrEqual(3);
  });
  it("gates are deterministic and ordered", () => {
    expect(contractComplete()).toBe(false);
    const g = bookingGates({ flagEnabled: true, contractComplete: false, verifiedStaffBooking: true, certified: true });
    expect(g.map((x) => x.open)).toEqual([false, false, false, false]);
    expect(bookingGates({ flagEnabled: true, contractComplete: true, verifiedStaffBooking: true, certified: false }).map((x) => x.open)).toEqual([true, true, false, false]);
  });
});
