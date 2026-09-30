import { describe, expect, it } from "vitest";
import { bookingGates, buildNewBookingBody, contractComplete, resolvePhoneCountryId } from "../booking-contract";
const C = [{ id: 5001, name: "India", phone_code: "+91", slug: "india" }, { id: 7, name: "US", phone_code: "+1", slug: "us" }, { id: 8, name: "Canada", phone_code: "+1", slug: "canada" }];

const rec = {
  tour_external_id: 42, tour_date: "2099-01-10", service_type: "regular", adults: 2, children: 0, infants: 0, rooms: {},
  supplier_currency: "EUR", lead_traveller: { firstName: "A", lastName: "B", email: "a@b.co", phone: "9999999999", phoneCountryCode: "91" },
};

describe("tour booking contract", () => {
  it("blocks without the partner country list (never guesses)", () => {
    expect(buildNewBookingBody(rec as never, [], "2026-09-30").ok).toBe(false);
  });
  it("maps phone country via the partner list only when unique", () => {
    expect(resolvePhoneCountryId("+91", C)).toBe(5001);
    expect(resolvePhoneCountryId("1", C)).toBeUndefined();
    const r = buildNewBookingBody(rec as never, C, "2026-09-30");
    expect(r.ok && (r.body.customers as { phone_code: number }[])[0].phone_code).toBe(5001);
  });
  it("blocks room-priced tours and past dates", () => {
    const r = buildNewBookingBody({ ...rec, tour_date: "2020-01-01", rooms: { double: 1 } } as never, C, "2026-09-30");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockers.length).toBeGreaterThanOrEqual(2);
  });
  it("gates are deterministic and ordered", () => {
    expect(contractComplete([])).toBe(false);
    const g = bookingGates({ flagEnabled: true, contractComplete: false, verifiedStaffBooking: true, certified: true });
    expect(g.map((x) => x.open)).toEqual([false, false, false, false]);
    expect(bookingGates({ flagEnabled: true, contractComplete: true, verifiedStaffBooking: true, certified: false }).map((x) => x.open)).toEqual([true, true, false, false]);
  });
});
