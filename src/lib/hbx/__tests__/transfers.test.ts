import { describe, expect, it } from "vitest";
import {
  buildAvailabilityPath,
  buildBookingBody,
  buildTransferVoucher,
  normaliseAvailability,
  normaliseBooking,
  policyUtc,
  validateBookingInput,
} from "../transfer-model";

describe("HBX transfers model", () => {
  it("builds one-way, round-trip and GPS availability paths", () => {
    expect(
      buildAvailabilityPath({ from: { type: "ATLAS", code: "5643" }, to: { type: "IATA", code: "CIA" }, outbound: "2026-11-10T10:00", adults: 2, children: 1, infants: 1 }),
    ).toBe("/availability/en/from/ATLAS/5643/to/IATA/CIA/2026-11-10T10:00:00/2/1/1");
    expect(
      buildAvailabilityPath({ from: { type: "IATA", code: "BCN" }, to: { type: "ATLAS", code: "57" }, outbound: "2026-11-10T10:00", inbound: "2026-11-13T18:00", adults: 2, children: 0, infants: 0 }),
    ).toContain("2026-11-10T10:00:00/2026-11-13T18:00:00/2/0/0");
    expect(
      buildAvailabilityPath({ from: { type: "GPS", code: "41.3851,2.1734" }, to: { type: "IATA", code: "BCN" }, outbound: "2026-11-10T10:00", adults: 1, children: 0, infants: 0 }),
    ).toContain("from/GPS/41.3851,2.1734");
    expect(() => buildAvailabilityPath({ from: { type: "IATA", code: "../x" }, to: { type: "IATA", code: "BCN" }, outbound: "2026-11-10T10:00", adults: 1, children: 0, infants: 0 })).toThrow();
  });

  it("converts cancellation policy local time to UTC", () => {
    expect(policyUtc("2026-11-08T10:00:00", "+01:00")).toBe("2026-11-08T09:00:00.000Z");
  });

  it("splits round-trip legs and reads checkPickup, extras and currency", () => {
    const svc = (from: string, to: string) => ({
      rateKey: `k-${from}`, direction: "ARRIVAL", transferType: "PRIVATE", vehicle: { code: "CR", name: "Car" }, category: { code: "STND", name: "Standard" },
      pickupInformation: { from: { code: from }, to: { code: to }, pickup: { checkPickup: { mustCheckPickupTime: true, url: "www.checkpickup.com", hoursBeforeConsulting: 24 } } },
      price: { totalAmount: 40, currencyId: "EUR" }, extras: [{ code: "T06", type: "Extra Suitcase", amount: 6.6 }],
      cancellationPolicies: [{ amount: 40, from: "2026-11-08T10:00:00", utcOffset: "+01:00", currencyId: "EUR" }],
    });
    const a = normaliseAvailability({ search: { to: { code: "57" }, comeBack: { date: "2026-11-13", time: "18:00:00" } }, services: [svc("BCN", "57"), svc("57", "BCN")] });
    expect(a.outbound).toHaveLength(1);
    expect(a.inbound).toHaveLength(1);
    expect(a.outbound[0]!.pickup.checkPickup?.mustCheckPickupTime).toBe(true);
    expect(a.outbound[0]!.price.currency).toBe("EUR");
    expect(a.outbound[0]!.extras[0]!.code).toBe("T06");
  });

  it("builds a booking body with holder, transport details and extras (units)", () => {
    const input = {
      holder: { name: "A", surname: "B", email: "a@b.co", phone: "+34600000000" },
      clientReference: "WWTABC123",
      remark: "hi",
      legs: [{ rateKey: "rate-key-12345", direction: "DEPARTURE" as const, transportType: "FLIGHT" as const, transportCode: "vy1234", extras: [{ code: "T06", units: 1 }] }],
    };
    expect(validateBookingInput(input)).toEqual([]);
    const body = buildBookingBody(input) as { transfers: { transferDetails: { code: string }[]; extras: { units: number }[] }[] };
    expect(body.transfers[0]!.transferDetails[0]!.code).toBe("VY1234");
    expect(body.transfers[0]!.extras[0]!.units).toBe(1);
    expect(validateBookingInput({ ...input, legs: [{ ...input.legs[0]!, transportCode: "" }] }).length).toBeGreaterThan(0);
  });

  it("issues a voucher only for confirmed bookings", () => {
    const raw = { bookings: [{ reference: "102-1", status: "CONFIRMED", creationDate: "2026-09-23T19:03:46", holder: { name: "A", surname: "B" }, totalAmount: 10, currency: "EUR", supplier: { name: "HOTELBEDS SPAIN, S.L.U", vatNumber: "ESB28916765" }, transfers: [{ status: "CONFIRMED", paxes: [{ type: "ADULT" }, { type: "CHILD" }], pickupInformation: { from: { description: "X" }, to: { description: "Y" }, date: "2026-11-10", time: "07:00:00" } }] }] };
    const b = normaliseBooking(raw)!;
    const v = buildTransferVoucher(b, "WWT1")!;
    expect(v.payableStatement).toContain("Bookable and payable by HOTELBEDS SPAIN");
    expect(v.legs[0]!.paxDistribution).toEqual({ adults: 1, children: 1, infants: 0 });
    expect(buildTransferVoucher({ ...b, status: "CANCELLED" }, "WWT1")).toBeNull();
  });
});
