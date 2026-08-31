import { describe, expect, it, vi, beforeEach } from "vitest";

const gFetch = vi.fn();
const recordWriteScope = vi.fn();

vi.mock("../tours.server", () => ({
  gFetch: (...a: unknown[]) => gFetch(...a),
  toursConfigured: () => true,
  toursBookingConfigured: () => true,
  recordWriteScope: (...a: unknown[]) => recordWriteScope(...a),
  checkDepartureAvailability: async () => ({
    ok: true,
    status: 200,
    bookable: true,
    room: { code: "STANDARD", name: "Standard", price: 100, deposit: 25 },
    totalPrice: 200,
  }),
}));

const { confirmTourBooking, createTourBooking, cancelTourBooking } = await import(
  "../tours-booking.server"
);

type Call = { path: string; method: string };
function route(map: Record<string, { status?: number; ok?: boolean; data?: unknown }>) {
  gFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const hit = map[key];
    if (!hit) return { ok: false, status: 404, error: `unrouted ${key}` };
    return { ok: hit.ok ?? true, status: hit.status ?? 200, data: hit.data };
  });
}

beforeEach(() => {
  gFetch.mockReset();
  recordWriteScope.mockReset();
});

describe("G Adventures reservation chain", () => {
  it("follows the documented bookings → customers → departure_services order", async () => {
    const calls: Call[] = [];
    gFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      calls.push({ path, method: init?.method ?? "GET" });
      if (path === "/bookings") return { ok: true, status: 201, data: { id: "628360" } };
      if (path === "/customers") return { ok: true, status: 201, data: { id: "1323083" } };
      if (path === "/departure_services")
        return {
          ok: true,
          status: 201,
          data: {
            id: "1162343",
            status: "Option",
            option_expiry_date: "2026-09-05T00:00:00Z",
            purchase_price: "2549.00",
            incomplete_requirements: [
              { type: "CONFIRMATION", code: "NATIONALITY", name: "Nationality", message: "" },
            ],
          },
        };
      return { ok: true, status: 200, data: { id: "628360", amount_owing: "2549.00" } };
    });

    const res = await createTourBooking({
      departureId: "420482",
      roomCode: "STANDARD",
      tourName: "Indochina Discovery",
      startDate: "2026-12-07",
      travellers: [{ firstName: "G", lastName: "Corp", email: "g@example.com" }],
    });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /bookings",
      "POST /customers",
      "POST /departure_services",
      "GET /bookings/628360",
    ]);
    expect(res.ok).toBe(true);
    // Supplier truth only — never "confirmed" straight after the hold.
    expect(res.serviceStatus).toBe("Option");
    expect(res.confirmationBlockers).toHaveLength(1);
  });

  it("reports the missing booking permission instead of a fake hold on 403", async () => {
    route({ "POST /bookings": { ok: false, status: 403 } });
    const res = await createTourBooking({
      departureId: "420482",
      roomCode: "STANDARD",
      tourName: "T",
      startDate: "2026-12-07",
      travellers: [{ firstName: "A", lastName: "B", email: "a@b.com" }],
    });
    expect(res.ok).toBe(false);
    expect(res.needsBookingPermission).toBe(true);
    expect(recordWriteScope).toHaveBeenCalledWith("READ_ONLY");
  });
});

describe("confirmation is fail-closed", () => {
  it("refuses to confirm while CONFIRMATION requirements are outstanding", async () => {
    route({
      "GET /departure_services/1162343": {
        data: {
          id: "1162343",
          status: "Option",
          incomplete_requirements: [
            { type: "CONFIRMATION", code: "PASSPORT_NUMBER", name: "Passport number" },
          ],
        },
      },
    });
    const res = await confirmTourBooking({ bookingId: "628360", serviceId: "1162343" });
    expect(res.confirmed).toBe(false);
    expect(res.requirementsOutstanding).toBe(true);
    // No PATCH may be attempted.
    expect(gFetch.mock.calls.some((c) => (c[1] as { method?: string })?.method === "PATCH")).toBe(
      false,
    );
  });

  it("only reports confirmed when a re-read returns Confirmed", async () => {
    let patched = false;
    gFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "PATCH") {
        patched = true;
        return { ok: true, status: 200, data: { id: "1", status: "Confirmed" } };
      }
      return {
        ok: true,
        status: 200,
        data: { id: "1", status: patched ? "Confirmed" : "Option", incomplete_requirements: [] },
      };
    });
    const res = await confirmTourBooking({ bookingId: "b", serviceId: "1" });
    expect(res.confirmed).toBe(true);
    expect(res.bookingStatus).toBe("Confirmed");
  });

  it("does not claim confirmation when the supplier keeps the service on Option", async () => {
    gFetch.mockImplementation(async (_p: string, init?: { method?: string }) => ({
      ok: init?.method !== "PATCH",
      status: init?.method === "PATCH" ? 400 : 200,
      data: { id: "1", status: "Option", incomplete_requirements: [] },
      error: "rejected",
    }));
    const res = await confirmTourBooking({ bookingId: "b", serviceId: "1" });
    expect(res.confirmed).toBe(false);
    expect(res.ok).toBe(false);
  });
});

describe("cancellation respects documented status transitions", () => {
  it("blocks a transition the supplier does not allow", async () => {
    route({
      "GET /departure_services/1": { data: { id: "1", status: "Expired", status_transitions: [] } },
    });
    const res = await cancelTourBooking({ bookingId: "b", serviceId: "1" });
    expect(res.ok).toBe(false);
    expect(gFetch.mock.calls.some((c) => (c[1] as { method?: string })?.method === "PATCH")).toBe(
      false,
    );
  });

  it("accepts a cancellation the supplier records", async () => {
    let patched = false;
    gFetch.mockImplementation(async (_p: string, init?: { method?: string }) => {
      if (init?.method === "PATCH") {
        patched = true;
        return { ok: true, status: 200, data: {} };
      }
      return {
        ok: true,
        status: 200,
        data: {
          id: "1",
          status: patched ? "Request Cancellation" : "Confirmed",
          status_transitions: ["Request Cancellation"],
        },
      };
    });
    const res = await cancelTourBooking({ bookingId: "b", serviceId: "1" });
    expect(res.ok).toBe(true);
  });
});
