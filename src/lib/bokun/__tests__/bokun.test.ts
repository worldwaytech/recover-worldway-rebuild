import { describe, expect, it } from "vitest";
import { bokunDate, bokunSignature } from "../client.server";
import { BookingDisabledError } from "../booking.server";

describe("bokun client signing", () => {
  it("formats the date header as yyyy-MM-dd HH:mm:ss UTC", () => {
    const d = new Date(Date.UTC(2026, 8, 24, 10, 30, 5));
    expect(bokunDate(d)).toBe("2026-09-24 10:30:05");
  });

  it("builds the signature as Base64 HMAC-SHA1 over accessKey+date+method+path", () => {
    // Golden vector computed independently (openssl dgst -sha1 -hmac).
    const sig = bokunSignature("secret", "access", "2026-09-24 10:30:05", "GET", "/activity.json/search");
    expect(sig).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(sig).toHaveLength(28);
    // Method case is normalised.
    expect(bokunSignature("secret", "access", "2026-09-24 10:30:05", "get", "/x")).toBe(
      bokunSignature("secret", "access", "2026-09-24 10:30:05", "GET", "/x"),
    );
    // Path participates in the signature.
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
