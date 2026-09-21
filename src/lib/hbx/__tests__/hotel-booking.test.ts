import { describe, it, expect } from "vitest";
import { HBX_SUITE_CONFIG, HBX_HOSTS } from "@/lib/hbx/config";

// Contract guards for the HBX Hotel Booking API wiring. These assert the
// documented endpoint/authentication shape without performing network calls.
describe("HBX hotel booking contract", () => {
  it("keeps the documented hotel booking endpoints", () => {
    const b = HBX_SUITE_CONFIG.hotels.bookingEndpoints;
    expect(HBX_SUITE_CONFIG.hotels.bookingBasePath).toBe("/hotel-api/1.0");
    expect(b["status"]).toBe("/status");
    expect(b["availability"]).toBe("/hotels");
    expect(b["checkRate"]).toBe("/checkrates");
    expect(b["booking"]).toBe("/bookings");
  });

  it("separates test and live hosts so test runs cannot hit live inventory", () => {
    expect(HBX_HOSTS.test).toBe("https://api.test.hotelbeds.com");
    expect(HBX_HOSTS.live).toBe("https://api.hotelbeds.com");
    expect(HBX_HOSTS.test).not.toBe(HBX_HOSTS.live);
  });

  it("references hotel credentials by secret name only", () => {
    expect(HBX_SUITE_CONFIG.hotels.apiKeySecret).toBe("HBX_HOTEL_API_KEY");
    expect(HBX_SUITE_CONFIG.hotels.apiSecretSecret).toBe("HBX_HOTEL_SECRET");
  });

  it("rejects client references outside the supplier's 1-20 character limit", async () => {
    const { createHotelBooking } = await import("@/lib/hbx/hotel-booking.server");
    await expect(
      createHotelBooking({
        rateKey: "x",
        holder: { name: "A", surname: "B" },
        clientReference: "THIS-REFERENCE-IS-DEFINITELY-TOO-LONG",
        paxes: [{ roomId: 1, type: "AD", name: "A", surname: "B" }],
      }),
    ).rejects.toThrow(/1 and 20/);
  });
});
