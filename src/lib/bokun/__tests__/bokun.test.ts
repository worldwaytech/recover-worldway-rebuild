import { describe, expect, it } from "vitest";
import { bokunDate, bokunSignature } from "../client.server";
import { BookingDisabledError } from "../booking.server";

describe("bokun client signing", () => {
  it("formats the date header as yyyy-MM-dd HH:mm:ss UTC", () => {
    const d = new Date(Date.UTC(2026, 8, 24, 10, 30, 5));
    expect(bokunDate(d)).toBe("2026-09-24 10:30:05");
  });

  it("matches the official Bókun documentation golden vector", () => {
    // From Bókun's "Configuring the platform for API usage and authentication":
    // secret 23e2c7da…, access de235a6a…, date 2013-11-09 14:33:46, POST
    // /activity.json/search?lang=EN&currency=ISK -> XrOiTYa9Y34zscnLCsAEh8ieoyo=
    const sig = bokunSignature(
      "23e2c7da7f7048e5b46f96bc91324800",
      "de235a6a15c340b6b1e1cb5f3687d04a",
      "2013-11-09 14:33:46",
      "POST",
      "/activity.json/search?lang=EN&currency=ISK",
    );
    expect(sig).toBe("XrOiTYa9Y34zscnLCsAEh8ieoyo=");
  });

  it("signs the path, so different paths yield different signatures", () => {
    expect(bokunSignature("secret", "access", "2026-09-24 10:30:05", "GET", "/a")).not.toBe(
      bokunSignature("secret", "access", "2026-09-24 10:30:05", "GET", "/b"),
    );
  });
});

describe("booking gate", () => {
  it("refuses bookings when BOKUN_BOOKING_ENABLED is not set", async () => {
    delete process.env["BOKUN_BOOKING_ENABLED"];
    const booking = await import("../booking.server");
    expect(booking.bookingsEnabled()).toBe(false);
    await expect(
      booking.octoCreateBooking({
        productId: "p",
        availabilityId: "a",
        unitItems: [],
        contact: { fullName: "T", emailAddress: "t@example.com" },
      }),
    ).rejects.toBeInstanceOf(BookingDisabledError);
  });

  it("still refuses when the flag is anything but exactly true", async () => {
    process.env["BOKUN_BOOKING_ENABLED"] = "1";
    const booking = await import("../booking.server");
    expect(booking.bookingsEnabled()).toBe(false);
    process.env["BOKUN_BOOKING_ENABLED"] = "TRUE";
    expect(booking.bookingsEnabled()).toBe(true);
    delete process.env["BOKUN_BOOKING_ENABLED"];
  });

  it("rejects malformed booking uuids before any network call", async () => {
    process.env["BOKUN_BOOKING_ENABLED"] = "true";
    const booking = await import("../booking.server");
    await expect(booking.octoCancelBooking("not-a-uuid")).rejects.toThrow("Invalid booking uuid");
    delete process.env["BOKUN_BOOKING_ENABLED"];
  });
});
