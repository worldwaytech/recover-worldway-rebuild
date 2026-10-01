import { describe, expect, it } from "vitest";
import { classifyOutcome, toMinor, worldwayTravelRef } from "../booking.server";

const booking = (o: Partial<{ bookingId: string | null; confirmationNo: string | null; status: string | null; confirmed: boolean }>) => ({
  bookingId: null, confirmationNo: null, status: null, confirmed: false, raw: {}, ...o,
});

describe("travel booking outcome", () => {
  it("confirms only on a genuine supplier confirmation", () => {
    expect(classifyOutcome({ ok: true, status: 200, data: booking({ bookingId: "9", confirmationNo: "ABC", confirmed: true }) }).kind).toBe("confirmed");
  });
  it("treats an unconfirmed 200 as uncertain, never confirmed", () => {
    expect(classifyOutcome({ ok: true, status: 200, data: booking({ bookingId: "9" }) }).kind).toBe("uncertain");
  });
  it("treats timeouts, network errors and 5xx as uncertain (no retry)", () => {
    expect(classifyOutcome(null).kind).toBe("uncertain");
    expect(classifyOutcome({ ok: false, status: 0, error: "timeout" }).kind).toBe("uncertain");
    expect(classifyOutcome({ ok: false, status: 502 }).kind).toBe("uncertain");
  });
  it("treats a clear 4xx / supplier error as refused", () => {
    expect(classifyOutcome({ ok: false, status: 400, error: "Room not available" }).kind).toBe("refused");
  });
  it("uses Worldway references and minor units", () => {
    expect(worldwayTravelRef("1a2b3c4d-5e6f-7a8b-9c0d-112233445566")).toBe("WWB-1A2B3C4D5E");
    expect(toMinor(6408.83, "INR")).toBe(640883);
    expect(toMinor(1000, "JPY")).toBe(1000);
  });
});
