import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { holdInputSchema, mapSupplierStatus } from "../booking-contract";

const ENV_KEYS = [
  "CRYSTAL_AKTG_API_KEY",
  "CRYSTAL_BOOKING_ENABLED",
  "CRYSTAL_BOOKING_BASE_URL",
  "CRYSTAL_BOOKING_PATH_PREBOOK",
  "CRYSTAL_BOOKING_PATH_CREATE",
  "CRYSTAL_BOOKING_PATH_RETRIEVE",
  "CRYSTAL_BOOKING_PATH_CANCEL",
] as const;

const snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) snapshot[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k] as string;
  }
});

describe("supplier status mapping", () => {
  it("maps supplier vocabulary onto the platform lifecycle", () => {
    expect(mapSupplierStatus("Confirmed")).toBe("confirmed");
    expect(mapSupplierStatus("OPTION")).toBe("held");
    expect(mapSupplierStatus("Cancelled")).toBe("cancelled");
    expect(mapSupplierStatus("waitlisted")).toBe("pending_confirmation");
    expect(mapSupplierStatus("declined")).toBe("failed");
    expect(mapSupplierStatus(undefined)).toBe("awaiting_supplier");
  });
});

describe("hold input validation", () => {
  const base = {
    voyageNumber: "AB240501",
    voyageTitle: "Mediterranean Reverie",
    currency: "USD",
    suiteCategory: "penthouse",
    quotedPricePerGuest: 12500,
    guests: [{ firstName: "Ada", lastName: "Lovelace" }],
    leadEmail: "guest@example.com",
    leadPhone: "+12025550123",
    idempotencyKey: "crz_abcdefgh",
  };

  it("accepts a well-formed hold request", () => {
    expect(holdInputSchema.parse(base).guests).toHaveLength(1);
  });

  it("rejects zero guests, bad email and non-positive fares", () => {
    expect(() => holdInputSchema.parse({ ...base, guests: [] })).toThrow();
    expect(() => holdInputSchema.parse({ ...base, leadEmail: "nope" })).toThrow();
    expect(() => holdInputSchema.parse({ ...base, quotedPricePerGuest: 0 })).toThrow();
    expect(() => holdInputSchema.parse({ ...base, guests: Array(5).fill(base.guests[0]) })).toThrow();
  });
});

describe("booking rail is fail-closed", () => {
  it("reports not configured when no operation paths exist", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    delete process.env["CRYSTAL_BOOKING_BASE_URL"];
    const cap = bookingCapability();
    expect(cap.live).toBe(false);
    expect(cap.reason).toBe("booking_api_not_configured");
  });

  it("stays disabled unless explicitly enabled", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    expect(bookingCapability().reason).toBe("booking_api_disabled");
  });

  it("refuses any supplier call while disabled", async () => {
    const { assertBookingLive, CrystalBookingUnavailableError } = await import(
      "../aktg-booking.server"
    );
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    expect(() => assertBookingLive("create")).toThrow(CrystalBookingUnavailableError);
  });

  it("requires every mandatory operation before going live", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    process.env["CRYSTAL_BOOKING_BASE_URL"] = "https://api.example.com/booking/";
    process.env["CRYSTAL_BOOKING_PATH_PREBOOK"] = "v1/prebook";
    const partial = bookingCapability();
    expect(partial.live).toBe(false);
    expect(partial.reason).toBe("booking_api_not_authorised");
    process.env["CRYSTAL_BOOKING_PATH_CREATE"] = "v1/create";
    process.env["CRYSTAL_BOOKING_PATH_RETRIEVE"] = "v1/retrieve";
    process.env["CRYSTAL_BOOKING_PATH_CANCEL"] = "v1/cancel";
    expect(bookingCapability().live).toBe(true);
  });
});
