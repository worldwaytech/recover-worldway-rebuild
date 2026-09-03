import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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
  "CRYSTAL_BOOKING_EGRESS_CONFIRMED",
  "CRYSTAL_BOOKING_CERTIFIED",
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
  it("stays disabled unless explicitly enabled", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    expect(bookingCapability().live).toBe(false);
    expect(bookingCapability().reason).toBe("booking_api_disabled");
  });

  it("reports missing credentials before anything else", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    delete process.env["CRYSTAL_AKTG_API_KEY"];
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    const cap = bookingCapability();
    expect(cap.live).toBe(false);
    expect(cap.reason).toBe("credentials_missing");
    expect(cap.operations).toHaveLength(0);
  });

  it("refuses any supplier call while disabled", async () => {
    const { assertBookingLive, CrystalBookingUnavailableError } = await import(
      "../aktg-booking.server"
    );
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    expect(() => assertBookingLive("option")).toThrow(CrystalBookingUnavailableError);
    expect(() => assertBookingLive("cancel")).toThrow(CrystalBookingUnavailableError);
  });

  it("stays fail-closed until the supplier channel context is configured", async () => {
    const { bookingCapability } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    delete process.env["CRYSTAL_BOOKING_SALES_CHANNEL"];
    delete process.env["CRYSTAL_BOOKING_OFFICE_ID"];
    delete process.env["CRYSTAL_BOOKING_EGRESS_CONFIRMED"];
    delete process.env["CRYSTAL_BOOKING_CERTIFIED"];
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
    // Egress + certification gates keep the rail closed even with credentials.
    expect(bookingCapability().reason).toBe("egress_not_confirmed");
    process.env["CRYSTAL_BOOKING_EGRESS_CONFIRMED"] = "true";
    expect(bookingCapability().reason).toBe("not_certified");
    process.env["CRYSTAL_BOOKING_CERTIFIED"] = "true";
    expect(bookingCapability().live).toBe(true);
  });
});

describe("Crystal PROD readiness check", () => {
  it("reports every gate and refuses LIVE while blockers remain", async () => {
    const { crystalProdReadiness } = await import("../readiness.server");
    delete process.env["CRYSTAL_BOOKING_SALES_CHANNEL"];
    delete process.env["CRYSTAL_BOOKING_OFFICE_ID"];
    delete process.env["CRYSTAL_BOOKING_EGRESS_CONFIRMED"];
    delete process.env["CRYSTAL_BOOKING_CERTIFIED"];
    delete process.env["CRYSTAL_BOOKING_ENABLED"];
    const report = await crystalProdReadiness(false);
    expect(report.probed).toBe(false);
    expect(report.readyForLive).toBe(false);
    expect(report.railArmed).toBe(false);
    expect(report.gates.map((g) => g.id)).toEqual([
      "connectivity",
      "entitlement",
      "sales_channel",
      "office_id",
      "egress",
      "operations_mapped",
      "read_only_verification",
      "certification",
      "activation",
    ]);
    expect(report.blockers.length).toBeGreaterThan(0);
    expect(report.gates.find((g) => g.id === "activation")?.state).toBe("red");
  });

  it("only turns every gate green when all AKTG gates are satisfied", async () => {
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_SALES_CHANNEL"] = "channel";
    process.env["CRYSTAL_BOOKING_OFFICE_ID"] = "office";
    process.env["CRYSTAL_BOOKING_EGRESS_CONFIRMED"] = "true";
    process.env["CRYSTAL_BOOKING_CERTIFIED"] = "true";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    const { crystalProdReadiness } = await import("../readiness.server");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      const report = await crystalProdReadiness(true);
      expect(report.probed).toBe(true);
      expect(report.blockers).toEqual([]);
      expect(report.readyForLive).toBe(true);
      // Enabled flag still false → activation is amber, never auto-enabled.
      expect(report.gates.find((g) => g.id === "activation")?.state).toBe("amber");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("never probes a mutating operation", async () => {
    const { probeBookingConnectivity } = await import("../aktg-booking.server");
    for (const op of ["option", "cancel", "prebook", "suites", "invoice"] as const) {
      const res = await probeBookingConnectivity(op);
      expect(res.attempted).toBe(false);
      expect(res.detail).toContain("GET");
    }
  });
});

describe("documented PROD operation mapping (AKTG Booking API spec)", () => {
  it("maps every documented operation to its exact spec path and method", async () => {
    const { CRYSTAL_BOOKING_SPEC } = await import("../booking-contract");
    const byOp = new Map(CRYSTAL_BOOKING_SPEC.map((s) => [s.operation, s]));
    const expected: Record<string, [string, string]> = {
      prebook: ["/v1/Bookings/suites", "POST"],
      suites: ["/v1/Bookings/suites", "DELETE"],
      quote: ["/v1/Bookings/quote", "POST"],
      option: ["/v1/Bookings/option", "POST"],
      modify: ["/v1/Bookings/{bookingId}/promote", "PUT"],
      retrieve: ["/v1/Bookings/{bookingId}", "GET"],
      cancel: ["/v1/Bookings/{bookingId}", "DELETE"],
      history: ["/v1/bookings/history/{bookingId}", "GET"],
      list: ["/v1/Bookings", "GET"],
      availability: ["/d/v1/cruises/availability", "GET"],
      availablesuites: ["/d/v1/cruises/availablesuites", "GET"],
      pricetypes: ["/v1/Bookings/pricetypescurrencies", "GET"],
      promotions: ["/d/v1/wsPromo/CruiseCategoryPromo", "GET"],
      pastguest: ["/v1/PastGuests/search", "GET"],
      pricebreakdown: ["/v2/bookings/pricebreakdown", "POST"],
      invoice: ["/v1/Bookings/{bookingId}/invoice", "POST"],
      paymentlink: ["/v1/Bookings/{bookingId}/paymentlink", "POST"],
      paymentlinkretrieve: ["/v1/RetrievePaymentLink/paymentlink", "POST"],
      paymentstatus: ["/v1/payments/requestInfo", "POST"],
    };
    for (const [op, [path, method]] of Object.entries(expected)) {
      expect(byOp.get(op as never)?.path).toBe(path);
      expect(byOp.get(op as never)?.method).toBe(method);
    }
    expect(CRYSTAL_BOOKING_SPEC).toHaveLength(Object.keys(expected).length);
  });

  it("declares the documented path parameters for booking-scoped operations", async () => {
    const { CRYSTAL_BOOKING_SPEC } = await import("../booking-contract");
    for (const op of ["retrieve", "cancel", "history", "modify", "invoice", "paymentlink"]) {
      const spec = CRYSTAL_BOOKING_SPEC.find((s) => s.operation === op);
      expect(spec?.requiredPathParams).toEqual(["bookingId"]);
    }
  });

  it("uses the documented method and never guesses", async () => {
    const { operationMethod } = await import("../aktg-booking.server");
    delete process.env["CRYSTAL_BOOKING_METHOD_RETRIEVE"];
    expect(operationMethod("retrieve")).toBe("GET");
    expect(operationMethod("option")).toBe("POST");
    expect(operationMethod("cancel")).toBe("DELETE");
    expect(operationMethod("modify")).toBe("PUT");
  });

  it("classifies mutating operations as not read-only", async () => {
    const { isReadOnlyOperation } = await import("../aktg-booking.server");
    for (const op of ["prebook", "option", "quote", "modify", "cancel", "invoice", "paymentlink"] as const) {
      expect(isReadOnlyOperation(op)).toBe(false);
    }
    for (const op of ["retrieve", "list", "availability", "pastguest", "pricetypes"] as const) {
      expect(isReadOnlyOperation(op)).toBe(true);
    }
  });

  it("exposes a catalogue covering every documented operation", async () => {
    const { bookingOperationCatalog } = await import("../aktg-booking.server");
    const { CRYSTAL_BOOKING_SPEC } = await import("../booking-contract");
    const catalog = bookingOperationCatalog();
    expect(catalog).toHaveLength(CRYSTAL_BOOKING_SPEC.length);
    expect(catalog.filter((c) => c.required).map((c) => c.operation).sort()).toEqual([
      "cancel",
      "option",
      "prebook",
      "retrieve",
    ]);
  });

  it("refuses a booking-scoped call without its documented path parameter", async () => {
    const { bookingCall } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    process.env["CRYSTAL_BOOKING_SALES_CHANNEL"] = "channel";
    process.env["CRYSTAL_BOOKING_OFFICE_ID"] = "office";
    process.env["CRYSTAL_BOOKING_EGRESS_CONFIRMED"] = "true";
    process.env["CRYSTAL_BOOKING_CERTIFIED"] = "true";
    await expect(bookingCall({ operation: "retrieve" })).rejects.toThrow(/bookingId/);
  });

  it("performs no supplier read while the rail is disabled", async () => {
    const { verifyBookingReadOnly } = await import("../aktg-booking.server");
    process.env["CRYSTAL_BOOKING_ENABLED"] = "false";
    const probes = await verifyBookingReadOnly();
    expect(probes.every((p) => p.attempted === false)).toBe(true);
  });

  it("never probes an operation that needs a bookingId", async () => {
    const { verifyBookingReadOnly } = await import("../aktg-booking.server");
    process.env["CRYSTAL_AKTG_API_KEY"] = "test-key";
    process.env["CRYSTAL_BOOKING_ENABLED"] = "true";
    process.env["CRYSTAL_BOOKING_SALES_CHANNEL"] = "channel";
    process.env["CRYSTAL_BOOKING_OFFICE_ID"] = "office";
    const probes = await verifyBookingReadOnly(["retrieve", "history"]);
    expect(probes.every((p) => p.attempted === false)).toBe(true);
  });
});
