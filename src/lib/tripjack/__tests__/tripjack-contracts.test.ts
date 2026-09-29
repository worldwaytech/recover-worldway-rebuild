import { describe, expect, it } from "vitest";
import {
  buildCabCancellationBody,
  buildCabPaymentBody,
  mapCabStatus,
  parseCabBookingDetails,
} from "../cabs-contract";
import {
  buildTravellerKeys,
  buildTripsafeBookBody,
  buildTripsafeConfirmBody,
  buildTripsafeRaiseBody,
  buildTripsafeReviewBody,
  extractAmendment,
  extractTripsafePolicies,
  extractTripsafeReview,
  flattenTripsafePlans,
  isTripsafeCancellable,
  tripsafeBookSucceeded,
  tripsafeIndicativeFare,
  validateTripsafeSearch,
  validateTripsafeSelection,
  type TripsafeSelection,
} from "../tripsafe-contract";
import { TRIPJACK_CABS_CAPABILITIES, TRIPJACK_CERTIFICATION_CASES, TRIPJACK_TRIPSAFE_CAPABILITIES, TRIPJACK_UAT_BASE_URL, tripjackBaseUrl, tripjackCapability } from "../config";

describe("TripJack config (UAT only, documented endpoints)", () => {
  it("targets the UAT host only", () => {
    expect(TRIPJACK_UAT_BASE_URL).toBe("https://apitest.tripjack.com");
    expect(tripjackBaseUrl("cabs")).toBe("https://apitest-cabs.tripjack.com");
    expect(tripjackBaseUrl("tripsafe")).toBe("https://apitest.tripjack.com");
  });
  it("maps the documented Cabs v2 endpoints", () => {
    const paths = Object.fromEntries(TRIPJACK_CABS_CAPABILITIES.map((c) => [c.key, `${c.method} ${c.path}`]));
    expect(paths["location-search"]).toBe("POST /cabs/v1/google-places");
    expect(paths["location-latlong"]).toBe("POST /cabs/v1/get-lat-long");
    expect(paths.quote).toBe("POST /cabs/v2/quotes");
    expect(paths.book).toBe("POST /cabs/v2/booking");
    expect(paths.payment).toBe("POST /cabs/v1/payment/create");
    expect(paths["booking-details"]).toBe("GET /cabs/v1/booking/details");
    expect(paths["amend-charges"]).toBe("GET /cabs/v1/amendment");
    expect(paths.cancel).toBe("POST /cabs/v1/amendment");
  });
  it("maps the documented TripSafe v5.1 endpoints", () => {
    const paths = Object.fromEntries(TRIPJACK_TRIPSAFE_CAPABILITIES.map((c) => [c.key, `${c.method} ${c.path}`]));
    expect(paths.search).toBe("POST /insurance/v1/searchquery-list");
    expect(paths.review).toBe("POST /insurance/v1/review");
    expect(paths.book).toBe("POST /oms/v1/insurance/book");
    expect(paths["booking-details"]).toBe("POST /oms/v1/insurance/booking-details");
    expect(paths.amend).toBe("POST /oms/v1/ins/amendment/raise");
    expect(paths.cancel).toBe("POST /oms/v1/ins/amendment/confirm-insurance-cancellation");
  });
  it("fails closed on unmapped capabilities", () => {
    expect(tripjackCapability("cabs", "tracking")?.path).toBeNull();
    expect(tripjackCapability("cabs", "made-up")).toBeNull();
  });
  it("lists every mandatory documented certification case", () => {
    const keys = TRIPJACK_CERTIFICATION_CASES.map((c) => c.key);
    for (const k of ["cabs-4.1-01", "cabs-4.1-02", "cabs-4.2-01", "cabs-4.2-02", "cabs-4.3-01", "cabs-4.3-02"]) expect(keys).toContain(k);
    expect(TRIPJACK_CERTIFICATION_CASES.find((c) => c.key === "cabs-4.5-embedded")?.optional).toBe(true);
    expect(keys).toContain("tripsafe-book-student-180");
    expect(keys).toContain("tripsafe-book-amt-30");
    expect(keys).toContain("tripsafe-cancel");
  });
});

describe("Cabs v2 payload builders", () => {
  it("builds the documented Payment body", () => {
    expect(buildCabPaymentBody({ amount: 8357, payUserId: "617306", bookingId: "TJS8083964163571" })).toEqual({
      amount: 8357,
      payUserId: "617306",
      paymentMedium: "WALLET",
      bookingId: "TJS8083964163571",
      opType: "DEBIT",
      product: "CAB",
      transactionType: "PAID_FOR_ORDER",
    });
  });
  it("builds the documented cancellation body (amendmentType, no remarks)", () => {
    expect(buildCabCancellationBody("TJS8086652803208")).toEqual({ bookingId: "TJS8086652803208", amendmentType: "CANCELLATION" });
  });
  it("parses Booking Details data[] and matches by bookingId", () => {
    const data = [
      { order: { bookingId: "TJS1", status: "PAYMENT_SUCCESS", paymentStatus: "SUCCESS", amount: 8357, rideStatus: "NOT_STARTED", trackingLink: "https://t/1" } },
      { order: { bookingId: "TJS2", status: "PAYMENT_PENDING", paymentStatus: "PENDING" } },
    ];
    expect(parseCabBookingDetails(data, "TJS2")?.status).toBe("PAYMENT_PENDING");
    expect(parseCabBookingDetails(data, "TJS1")).toMatchObject({ bookingId: "TJS1", amount: 8357, trackingLink: "https://t/1" });
    expect(parseCabBookingDetails([], "TJS9")).toBeNull();
    expect(parseCabBookingDetails(data, "TJS9")).toBeNull();
  });
  it("maps supplier statuses conservatively", () => {
    expect(mapCabStatus("PAYMENT_SUCCESS")).toBe("confirmed");
    expect(mapCabStatus("PAYMENT_PENDING")).toBe("pending");
    expect(mapCabStatus("CANCELLED")).toBe("cancelled");
    expect(mapCabStatus("SOMETHING_NEW")).toBe("pending");
    expect(mapCabStatus(undefined)).toBe("pending");
  });
});

const livePlan = {
  pid: "ABHI-PLAN_500-XUSC-AAI-BOXX-ZETEXA-BRB",
  pn: "$500,000",
  pi: "Titanium",
  ip: "ABHI",
  rname: "Worldwide excluding US & Canada",
  pbft: [{ bv: "BANNER", name: "24 hour Travel Assistance Hotline", type: "ASSISTANCE_BENEFIT", bfp: "AAI" }],
  pfd: {
    ppd: {
      ppdf: {
        "1": [{ age: 30, ifc: { TF: 1250 } }],
        "7": [{ age: 30, ifc: { TF: 1775 } }],
        "8": [{ age: 30, ifc: { TF: 1775 } }, { age: 45, ifc: { TF: 1900 } }],
      },
    },
  },
  ptf: 11300,
};

describe("TripSafe v5.1 mapping", () => {
  it("derives the indicative fare from the highest day key and sums travellers", () => {
    expect(tripsafeIndicativeFare(livePlan)).toBe(3675);
    expect(tripsafeIndicativeFare({ pid: "x" })).toBeUndefined();
  });
  it("flattens live-shaped search responses with pi / ip / rname / pbft", () => {
    const plans = flattenTripsafePlans({ isr: { iinfo: { pli: [{ plid: "isid1_0_regular", pi: [livePlan] }] } } });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ plid: "isid1_0_regular", pid: livePlan.pid, insurer: "ABHI", tier: "Titanium", sumInsured: "$500,000" });
    expect(plans[0]!.benefits[0]!.name).toBe("24 hour Travel Assistance Hotline");
  });
  it("builds the standalone Review body and reads bid + tfd.ifc.TF", () => {
    expect(buildTripsafeReviewBody({ plid: "isid1_0_regular", pid: "P" })).toEqual({ pli: [{ plid: "isid1_0_regular", pi: [{ pid: "P" }] }] });
    const r = extractTripsafeReview({ bid: "TJS708202930196", iinfo: { pli: [{ plid: "x", pi: [{ pid: "P", tfd: { ifc: { TF: 1775 } } }] }] } });
    expect(r).toEqual({ bid: "TJS708202930196", totalFare: 1775 });
    expect(extractTripsafeReview({}).bid).toBeUndefined();
  });
});

const selection: TripsafeSelection = {
  plid: "isid1_0_regular",
  pid: "ABHI-PLAN_100-WW-AAI",
  sd: "2026-10-01",
  ed: "2026-10-10",
  iti: [
    { id: 1, ti: "Mr", fn: "Jatinderpal", ln: "Singh", age: 40, dob: "1986-06-15", eid: "lead@example.com", cnum: "9587507322", pnum: "X12345678", pincode: "110001", gen: "M", nomineeName: "Harpreet Kaur", nomineeRelation: "SPOUSE" },
    { id: 2, ti: "Mrs", fn: "Harpreet", ln: "Kaur", age: 38, dob: "1988-02-02", gen: "F", nomineeName: "Jatinderpal Singh", nomineeRelation: "SPOUSE" },
  ],
};

describe("TripSafe v5.1 Booking / amendment payloads", () => {
  it("builds the documented Book body", () => {
    const body = buildTripsafeBookBody({ bid: "BID1", amount: 7500, selection });
    expect(body.bookingId).toBe("BID1");
    expect(body.paymentInfos).toEqual([{ paymentMedium: "WALLET", amount: 7500 }]);
    expect(body.pli[0]!.plid).toBe(selection.plid);
    expect(body.pli[0]!.pi[0]!.pid).toBe(selection.pid);
    expect(body.pli[0]!.pi[0]!.iti[0]).toEqual({
      id: 1, dob: "1986-06-15", age: 40, fn: "Jatinderpal", ln: "Singh", eid: "lead@example.com", pnum: "X12345678", pincode: "110001", gen: "M",
      ni: [{ nn: "Harpreet Kaur", nr: "SPOUSE" }],
    });
    expect(body.pli[0]!.pi[0]!.iti[1]).not.toHaveProperty("eid");
    expect(body.deliveryInfo).toEqual({ emails: ["lead@example.com"], contacts: ["9587507322"] });
    expect(JSON.stringify(body)).not.toContain("\"ti\":");
  });
  it("only treats status.success === true as booked", () => {
    expect(tripsafeBookSucceeded({ bid: "x", status: { success: true } })).toBe(true);
    expect(tripsafeBookSucceeded({ bid: "x", status: { success: false } })).toBe(false);
    expect(tripsafeBookSucceeded({ bid: "x" })).toBe(false);
    expect(tripsafeBookSucceeded(undefined)).toBe(false);
  });
  it("builds travellerKeys and both amendment bodies", () => {
    const keys = buildTravellerKeys("isid1_0_regular", "ABHI-PLAN_100-WW-AAI", [1, 2]);
    expect(keys).toEqual({ isid1_0_regular: { "ABHI-PLAN_100-WW-AAI": [{ id: 1 }, { id: 2 }] } });
    expect(buildTripsafeRaiseBody("TJS7", keys)).toEqual({ amendmentId: "", bookingId: "TJS7", type: "CANCELLATION", travellerKeys: keys });
    expect(buildTripsafeConfirmBody("060000729805", "TJS7", keys)).toEqual({ amendmentId: "060000729805", bookingId: "TJS7", type: "INSURANCE_CANCELLATION", travellerKeys: keys });
  });
  it("reads amendmentItems by bookingId", () => {
    const raw = { amendmentItems: [{ amendmentId: "A1", bookingId: "B1", status: "REQUESTED" }, { amendmentId: "A2", bookingId: "B2", status: "SUCCESS" }] };
    expect(extractAmendment(raw, "B2")?.amendmentId).toBe("A2");
    expect(extractAmendment({}, "B9")).toBeUndefined();
  });
  it("extracts per-traveller policyIds from Booking Details", () => {
    const details = { itemInfos: { INSURANCE: { iinfo: { pli: [{ plid: "pl", pi: [{ pid: "pd", iti: [{ id: 1, fn: "A", ln: "B", policyId: "TSON11038682" }, { id: 2 }] }] }] } } } };
    expect(extractTripsafePolicies(details)).toEqual([{ travellerId: 1, fn: "A", ln: "B", policyId: "TSON11038682", plid: "pl", pid: "pd" }]);
    expect(extractTripsafePolicies(null)).toEqual([]);
  });
});

describe("TripSafe supplier rules", () => {
  it("enforces the 24-hour cancellation cut-off before coverage start", () => {
    // Coverage starts 2026-10-01 00:00 IST → deadline 2026-09-30 00:00 IST (2026-09-29T18:30Z)
    expect(isTripsafeCancellable("2026-10-01", new Date("2026-09-29T18:00:00Z"))).toBe(true);
    expect(isTripsafeCancellable("2026-10-01", new Date("2026-09-29T19:00:00Z"))).toBe(false);
    expect(isTripsafeCancellable("2026-10-01", new Date("2026-10-02T00:00:00Z"))).toBe(false);
    expect(isTripsafeCancellable("not-a-date")).toBe(false);
  });
  it("rejects placeholder names and missing documented fields before Book", () => {
    expect(validateTripsafeSelection(selection)).toBeNull();
    expect(validateTripsafeSelection({ ...selection, iti: [{ ...selection.iti[0]!, fn: "TBA" }] })).toMatch(/real name/);
    expect(validateTripsafeSelection({ ...selection, iti: [{ ...selection.iti[0]!, gen: undefined }] })).toMatch(/gender/);
    expect(validateTripsafeSelection({ ...selection, iti: [{ ...selection.iti[0]!, nomineeName: "" }] })).toMatch(/nominee/);
    expect(validateTripsafeSelection({ ...selection, iti: [{ ...selection.iti[0]!, eid: undefined }] })).toMatch(/email/);
  });
  it("applies §4 search validations", () => {
    const base = { isq: { sd: "2026-10-01", ed: "2026-10-10", isc: { iri: [{ rkey: "SCH", rt: "POPULARREGION" as const }] }, iti: [{ age: 30 }] } };
    expect(validateTripsafeSearch(base)).toBeNull();
    expect(validateTripsafeSearch({ isq: { ...base.isq, iti: [{ age: 71 }] } })).toMatch(/70/);
    expect(validateTripsafeSearch({ isq: { ...base.isq, isc: { iri: [{ rkey: "IR", rt: "COUNTRY" }] } } })).toMatch(/IR/);
    expect(validateTripsafeSearch({ isq: { ...base.isq, ed: "2027-01-15" } })).toMatch(/90/);
    expect(validateTripsafeSearch({ isq: { ...base.isq, ict: "STUDENT", cd: undefined } })).toMatch(/duration/);
    expect(validateTripsafeSearch({ isq: { ...base.isq, ict: "STUDENT", cd: "180", iti: [{ age: 50 }] } })).toMatch(/18 to 45/);
  });
});
