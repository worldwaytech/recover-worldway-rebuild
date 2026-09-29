import { describe, expect, it } from "vitest";
import { searchAirports, findAirportByCode, allAirports } from "../airports.server";
import { matchesAirport } from "../airport-match";
import { checkQuotePayable, receiptNumber, renderAviationEmail, STATUS_LABEL, type QuoteRow } from "../quote";
import { mapStage } from "../villiers.server";

describe("airport master", () => {
  it("covers the world, far beyond live empty-leg inventory", () => {
    expect(allAirports().length).toBeGreaterThan(10000);
    const countries = new Set(allAirports().map((a) => a.country));
    expect(countries.size).toBeGreaterThan(200);
  });
  it("finds by IATA, ICAO, city and name", () => {
    expect(searchAirports("LHR")[0]?.name).toMatch(/Heathrow/);
    expect(searchAirports("EGGW")[0]?.iata).toBe("LTN");
    expect(searchAirports("nice").some((a) => a.iata === "NCE")).toBe(true);
    expect(searchAirports("teterboro").some((a) => a.iata === "TEB")).toBe(true);
    expect(searchAirports("dubai")[0]?.country).toBe("United Arab Emirates");
  });
  it("ignores too-short queries and limits results", () => {
    expect(searchAirports("l")).toEqual([]);
    expect(searchAirports("new", 5).length).toBeLessThanOrEqual(5);
  });
  it("resolves codes and matches ICAO-coded live legs", () => {
    const hou = findAirportByCode("HOU")!;
    expect(hou.icao).toBe("KHOU");
    expect(matchesAirport(hou, "KHOU", "")).toBe(true);
    expect(matchesAirport(hou, "KIAD", "Washington Dulles International Airport")).toBe(false);
  });
});

const base: QuoteRow = {
  reference: "WWPA-260929-ABCDEF",
  user_id: "u1",
  status: "quoted",
  quote_amount: "12500.50",
  quote_currency: "usd",
  quote_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  quote_version: 2,
  paid_at: null,
};

describe("quote payment", () => {
  it("returns the server amount in minor units", () => {
    expect(checkQuotePayable(base, "u1")).toEqual({ ok: true, amountMinor: 1250050, currency: "USD", version: 2 });
  });
  it("rejects other users, unquoted, paid, expired and bad currencies", () => {
    expect(checkQuotePayable(base, "u2").ok).toBe(false);
    expect(checkQuotePayable(base, null).ok).toBe(false);
    expect(checkQuotePayable({ ...base, status: "sourcing" }, "u1").ok).toBe(false);
    expect(checkQuotePayable({ ...base, paid_at: new Date().toISOString() }, "u1").ok).toBe(false);
    expect(checkQuotePayable({ ...base, quote_expires_at: new Date(Date.now() - 1000).toISOString() }, "u1").ok).toBe(false);
    expect(checkQuotePayable({ ...base, quote_currency: "JPY" }, "u1").ok).toBe(false);
    expect(checkQuotePayable({ ...base, quote_amount: 0 }, "u1").ok).toBe(false);
    expect(checkQuotePayable(null, "u1").ok).toBe(false);
  });
});

describe("receipts and emails", () => {
  it("builds a Worldway receipt number", () => {
    expect(receiptNumber("WWPA-260929-ABCDEF", new Date("2026-09-29T10:00:00Z"))).toBe("WWPA-RCPT-20260929-ABCDEF");
  });
  it("renders Worldway-branded emails with no partner identity", () => {
    for (const kind of ["request_received", "quote_ready", "payment_receipt"] as const) {
      const m = renderAviationEmail({
        kind, reference: base.reference, customerName: "Ana <b>", route: "LTN → NCE", departureDate: "2026-11-20",
        passengers: 4, aircraft: "Citation XLS", amount: 12500, currency: "USD", receiptNumber: "WWPA-RCPT-1", paymentId: "pay_1",
        link: "https://worldwaytravelsgroup.com/private-aviation/quote/WWPA-260929-ABCDEF",
      });
      expect(m.html).toContain("WORLDWAY PRIVATE AVIATION");
      expect(m.html).toContain(base.reference);
      expect(m.html).not.toContain("<b>");
      expect(`${m.subject}${m.html}${m.text}`.toLowerCase()).not.toContain("villiers");
    }
  });
});

describe("booking status", () => {
  it("maps partner stages to Worldway statuses", () => {
    expect(mapStage("received")).toBe("sourcing");
    expect(mapStage("options sent")).toBe("options_sent");
    expect(mapStage("booked")).toBe("booked");
    expect(mapStage("closed with no booking")).toBe("booked".length ? "closed" : "");
    expect(STATUS_LABEL["quoted"]).toBe("Confirmed quote ready");
    expect(STATUS_LABEL["paid"]).toBe("Paid");
  });
});
