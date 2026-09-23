/**
 * Worldway-side Viator certification behaviours that do not need booking access:
 * age bands, booking questions / pickup answers and voucher gating.
 */
import { describe, expect, it } from "vitest";
import {
  ageBandLabel,
  sortAgeBands,
  validatePaxMixAgainstBands,
  type AgeBandRule,
} from "../age-bands";
import {
  buildPickupAnswer,
  groupBookingQuestions,
  travellerNameAnswers,
  validateBookingQuestionAnswers,
  type BookingQuestion,
} from "../booking-questions";
import { buildActivityVoucher } from "../voucher";

const band = (over: Partial<AgeBandRule> & Pick<AgeBandRule, "ageBand">): AgeBandRule => ({
  startAge: null,
  endAge: null,
  minTravelersPerBooking: null,
  maxTravelersPerBooking: null,
  ...over,
});

describe("viator age bands", () => {
  it("labels a band with the supplier's published ages", () => {
    expect(ageBandLabel({ ageBand: "CHILD", startAge: 3, endAge: 12 })).toContain("3");
  });

  it("sorts bands oldest first", () => {
    const sorted = sortAgeBands([band({ ageBand: "CHILD" }), band({ ageBand: "ADULT" })]);
    expect(sorted[0]?.ageBand).toBe("ADULT");
  });

  it("rejects an age band the product does not sell", () => {
    const res = validatePaxMixAgainstBands(
      [{ ageBand: "INFANT", count: 1 }],
      [band({ ageBand: "ADULT" })],
      {},
    );
    expect(res.ok).toBe(false);
  });

  it("enforces the product's per-booking traveller limits", () => {
    const res = validatePaxMixAgainstBands(
      [{ ageBand: "ADULT", count: 9 }],
      [band({ ageBand: "ADULT" })],
      { maxTravelersPerBooking: 8 },
    );
    expect(res.ok).toBe(false);
  });

  it("accepts a valid mix", () => {
    const res = validatePaxMixAgainstBands(
      [
        { ageBand: "ADULT", count: 2 },
        { ageBand: "CHILD", count: 1 },
      ],
      [band({ ageBand: "ADULT" }), band({ ageBand: "CHILD" })],
      { minTravelersPerBooking: 2, maxTravelersPerBooking: 6 },
    );
    expect(res.ok).toBe(true);
  });
});

describe("viator booking questions", () => {
  const questions: BookingQuestion[] = [
    {
      id: "FULL_NAMES_FIRST",
      label: "First name",
      type: "STRING",
      required: "MANDATORY",
      group: "PER_TRAVELER",
      hint: null,
      maxLength: 50,
      allowedAnswers: [],
      units: [],
    },
    {
      id: "PICKUP_POINT",
      label: "Pickup point",
      type: "LOCATION_REF_OR_FREE_TEXT",
      required: "MANDATORY",
      group: "PER_BOOKING",
      hint: null,
      maxLength: null,
      allowedAnswers: [],
      units: ["LOCATION_REFERENCE", "FREETEXT"],
    },
    {
      id: "SPECIAL_REQUIREMENTS",
      label: "Special requirements",
      type: "STRING",
      required: "OPTIONAL",
      group: "PER_BOOKING",
      hint: null,
      maxLength: 200,
      allowedAnswers: [],
      units: [],
    },
  ];

  it("separates traveller names, pickup and per-booking questions", () => {
    const grouped = groupBookingQuestions(questions);
    expect(grouped.travellerNames).toHaveLength(1);
    expect(grouped.pickup).toHaveLength(1);
    expect(grouped.perBooking.map((q) => q.id)).toEqual(["SPECIAL_REQUIREMENTS"]);
  });

  it("numbers traveller names from 1", () => {
    const answers = travellerNameAnswers([
      { firstName: "Ada", lastName: "Lovelace" },
      { firstName: "Alan", lastName: "Turing" },
    ]);
    expect(answers.find((a) => a.answer === "Alan")?.travelerNum).toBe(2);
  });

  it("marks a chosen pickup location as a location reference", () => {
    const res = buildPickupAnswer({ locationRef: "LOC-1", allowCustomTravelerPickup: false });
    expect(res).toMatchObject({ question: "PICKUP_POINT", unit: "LOCATION_REFERENCE" });
  });

  it("refuses free-text pickup when the supplier does not allow it", () => {
    const res = buildPickupAnswer({ freeText: "My hotel", allowCustomTravelerPickup: false });
    expect("error" in res).toBe(true);
  });

  it("requires a mandatory answer for every traveller", () => {
    const res = validateBookingQuestionAnswers(
      questions,
      [
        { question: "FULL_NAMES_FIRST", answer: "Ada", travelerNum: 1 },
        { question: "PICKUP_POINT", answer: "LOC-1", unit: "LOCATION_REFERENCE" },
      ],
      2,
    );
    expect(res.ok).toBe(false);
  });

  it("drops questions the product never asked for", () => {
    const res = validateBookingQuestionAnswers(
      questions,
      [
        { question: "FULL_NAMES_FIRST", answer: "Ada", travelerNum: 1 },
        { question: "PICKUP_POINT", answer: "LOC-1", unit: "LOCATION_REFERENCE" },
        { question: "NOT_A_REAL_QUESTION", answer: "x" },
      ],
      1,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.answers.some((a) => a.question === "NOT_A_REAL_QUESTION")).toBe(false);
    }
  });
});

describe("worldway activity voucher", () => {
  const base = {
    worldwayReference: "WW-1",
    itineraryReference: null,
    productCode: "P1",
    productTitle: "Desert dinner",
    travelDate: "2026-05-01",
    startTime: null,
    travellers: [{ travelerNum: 1, firstName: "Ada", lastName: "Lovelace" }],
    paxMix: [{ ageBand: "ADULT" as const, count: 1 }],
    currency: "USD",
    total: 120,
    cancellationPolicy: "Free cancellation up to 24 hours before",
    meetingPoint: "Hotel lobby",
    pickup: null,
    languageGuide: null,
    productOption: null,
    customerEmail: "guest@example.com",
    customerPhone: "+971501234567",
    voucherRestrictionRequired: false,
    supplierVoucherUrl: null,
  };

  it("is not issued before the supplier confirms", () => {
    const res = buildActivityVoucher({ ...base, state: "paid_pending_confirmation", bookingReference: null });
    expect(res.issued).toBe(false);
  });

  it("is not issued without a supplier reference", () => {
    const res = buildActivityVoucher({ ...base, state: "confirmed", bookingReference: null });
    expect(res.issued).toBe(false);
  });

  it("is issued for a confirmed booking with a supplier reference", () => {
    const res = buildActivityVoucher({ ...base, state: "confirmed", bookingReference: "BR-9" });
    expect(res.issued).toBe(true);
    if (res.issued) {
      expect(res.voucher.worldwayReference).toBe("WW-1");
      expect(res.voucher.supplierReference).toBe("BR-9");
      expect(res.voucher.cancellationPolicy).toContain("24 hours");
    }
  });
});
