import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { holdInputSchema, mapSupplierStatus } from "../booking-contract";

const ENV_KEYS = [
  "CRYSTAL_AKTG_API_KEY",
  "CRYSTAL_BOOKING_ENABLED",
  "CRYSTAL_BOOKING_BASE_URL",
  "CRYSTAL_BOOKING_SALES_CHANNEL",
  "CRYSTAL_BOOKING_OFFICE_ID",
  "CRYSTAL_BOOKING_PATH_PREBOOK",
  "CRYSTAL_BOOKING_PATH_QUOTE",
  "CRYSTAL_BOOKING_PATH_OPTION",
  "CRYSTAL_BOOKING_PATH_CREATE",
  "CRYSTAL_BOOKING_PATH_RETRIEVE",
  "CRYSTAL_BOOKING_PATH_HISTORY",
  "CRYSTAL_BOOKING_PATH_LIST",
  "CRYSTAL_BOOKING_PATH_MODIFY",
  "CRYSTAL_BOOKING_PATH_CANCEL",
  "CRYSTAL_BOOKING_PATH_AVAILABILITY",
  "CRYSTAL_BOOKING_PATH_SUITES",
  "CRYSTAL_BOOKING_PATH_NETFARES",
  "CRYSTAL_BOOKING_PATH_PRICETYPES",
  "CRYSTAL_BOOKING_PATH_PROMOTIONS",
  "CRYSTAL_BOOKING_PATH_PASTGUEST",
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
    process.env["CRYSTAL_BOOKING_SALES_CHANNEL"] = "channel";
    process.env["CRYSTAL_BOOKING_OFFICE_ID"] = "office";
    process.env["CRYSTAL_BOOKING_PATH_PREBOOK"] = "v1/prebook";
    const partial = bookingCapability();
    expect(partial.live).toBe(false);
    expect(partial.reason).toBe("booking_api_not_authorised");
    process.env["CRYSTAL_BOOKING_PATH_CREATE"] = "v1/create";
    process.env["CRYSTAL_BOOKING_PATH_RETRIEVE"] = "v1/retrieve";
    process.env["CRYSTAL_BOOKING_PATH_CANCEL"] = "v1/cancel";
    expect(bookingCapability().live).toBe(true);
  });

  it("stays fail-closed until the supplier channel context is configured", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    process.env["CRYSTAL_BOOKING_BASE_URL"] = "https://api.example.com/booking/";
    process.env["CRYSTAL_BOOKING_PATH_PREBOOK"] = "v1/prebook";
    process.env["CRYSTAL_BOOKING_PATH_CREATE"] = "v1/create";
    process.env["CRYSTAL_BOOKING_PATH_RETRIEVE"] = "v1/retrieve";
    process.env["CRYSTAL_BOOKING_PATH_CANCEL"] = "v1/cancel";
    delete process.env["CRYSTAL_BOOKING_SALES_CHANNEL"];
    delete process.env["CRYSTAL_BOOKING_OFFICE_ID"];
    const noChannel = bookingCapability();
    expect(noChannel.live).toBe(false);
    expect(noChannel.reason).toBe("channel_context_missing");
    expect(noChannel.channel).toEqual({
      salesChannelConfigured: false,
      officeIdConfigured: false,
    });
    process.env["CRYSTAL_BOOKING_SALES_CHANNEL"] = "channel";
    expect(bookingCapability().reason).toBe("channel_context_missing");
    process.env["CRYSTAL_BOOKING_OFFICE_ID"] = "office";
    expect(bookingCapability().live).toBe(true);
  });
});

describe("documented operation mapping", () => {
  const ALL = [
    "prebook",
    "quote",
    "option",
    "create",
    "retrieve",
    "history",
    "list",
    "modify",
    "cancel",
    "availability",
    "suites",
    "netfares",
    "pricetypes",
    "promotions",
    "pastguest",
  ] as const;

  it("exposes an env-driven path slot for every documented operation", async () => {
    const { operationEnvVar, bookingOperationCatalog } = await import("../aktg-booking.server");
    for (const op of ALL) {
      expect(operationEnvVar(op)).toMatch(/^CRYSTAL_BOOKING_PATH_/);
    }
    process.env["CRYSTAL_BOOKING_BASE_URL"] = "";
    const catalog = bookingOperationCatalog();
    expect(catalog).toHaveLength(ALL.length);
    expect(catalog.every((c) => c.configured === false)).toBe(true);
    expect(catalog.filter((c) => c.required).map((c) => c.operation).sort()).toEqual(
      ["cancel", "create", "prebook", "retrieve"],
    );
  });

  it("reports configured versus unconfigured operations", async () => {
    const { bookingOperationCatalog } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_BASE_URL"] = "https://api.example.com/booking/";
    process.env["CRYSTAL_BOOKING_PATH_AVAILABILITY"] = "v1/availability";
    const catalog = bookingOperationCatalog();
    expect(catalog.find((c) => c.operation === "availability")?.configured).toBe(true);
    expect(catalog.find((c) => c.operation === "create")?.configured).toBe(false);
    delete process.env["CRYSTAL_BOOKING_PATH_AVAILABILITY"];
  });

  it("classifies mutating operations as not read-only", async () => {
    const { isReadOnlyOperation } = await import("../aktg-booking.server");
    for (const op of ["prebook", "create", "modify", "cancel"] as const) {
      expect(isReadOnlyOperation(op)).toBe(false);
    }
    for (const op of ["retrieve", "list", "availability", "pastguest"] as const) {
      expect(isReadOnlyOperation(op)).toBe(true);
    }
  });

  it("never guesses an HTTP method away from the documented configuration", async () => {
    const { operationMethod } = await import("../aktg-booking.server");
    delete process.env["CRYSTAL_BOOKING_METHOD_RETRIEVE"];
    expect(operationMethod("retrieve", false)).toBe("GET");
    expect(operationMethod("create", true)).toBe("POST");
    process.env["CRYSTAL_BOOKING_METHOD_CANCEL"] = "delete";
    expect(operationMethod("cancel", false)).toBe("DELETE");
    delete process.env["CRYSTAL_BOOKING_METHOD_CANCEL"];
  });

  it("performs no supplier read while the rail is disabled", async () => {
    const { verifyBookingReadOnly } = await import("../aktg-booking.server");
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    const probes = await verifyBookingReadOnly();
    expect(probes.every((p) => p.attempted === false)).toBe(true);
  });
});
