/**
 * Viator booking questions (pure, client-safe).
 *
 * Viator publishes a global question dictionary at `/products/booking-questions`
 * and each product lists the `bookingQuestions` ids it requires. Questions are
 * either PER_BOOKING or PER_TRAVELER. Traveller names (FULL_NAMES_FIRST /
 * FULL_NAMES_LAST) and every pickup / arrival / departure detail are themselves
 * booking questions — answering these correctly *is* the pickup workflow.
 *
 * Question ids below are exactly the enumeration published in the Viator
 * Partner API v2 specification (BookingQuestionAnswers.question).
 */

export type BookingQuestionGroup = "PER_BOOKING" | "PER_TRAVELER";

/** BookingQuestionFormatType from the v2 spec. */
export type BookingQuestionFormat =
  | "STRING"
  | "NUMBER_AND_UNIT"
  | "DATE"
  | "TIME"
  | "LOCATION_REF_OR_FREE_TEXT";

export type BookingQuestion = {
  id: string;
  label: string;
  type: BookingQuestionFormat | string;
  required: "MANDATORY" | "OPTIONAL" | "CONDITIONAL";
  group: BookingQuestionGroup;
  hint: string | null;
  maxLength: number | null;
  allowedAnswers: string[];
  units: string[];
};

export type BookingQuestionAnswer = {
  question: string;
  answer: string;
  /** 1-based traveller index, required for PER_TRAVELER questions. */
  travelerNum?: number;
  unit?: string;
};

/** Pickup / arrival / departure logistics questions (v2 enumeration). */
export const PICKUP_QUESTION_IDS = [
  "PICKUP_POINT",
  "TRANSFER_AIR_ARRIVAL_AIRLINE",
  "TRANSFER_AIR_ARRIVAL_FLIGHT_NO",
  "TRANSFER_AIR_DEPARTURE_AIRLINE",
  "TRANSFER_AIR_DEPARTURE_FLIGHT_NO",
  "TRANSFER_ARRIVAL_DROP_OFF",
  "TRANSFER_ARRIVAL_MODE",
  "TRANSFER_ARRIVAL_TIME",
  "TRANSFER_DEPARTURE_DATE",
  "TRANSFER_DEPARTURE_MODE",
  "TRANSFER_DEPARTURE_PICKUP",
  "TRANSFER_DEPARTURE_TIME",
  "TRANSFER_PORT_ARRIVAL_TIME",
  "TRANSFER_PORT_CRUISE_SHIP",
  "TRANSFER_PORT_DEPARTURE_TIME",
  "TRANSFER_RAIL_ARRIVAL_LINE",
  "TRANSFER_RAIL_ARRIVAL_STATION",
  "TRANSFER_RAIL_DEPARTURE_LINE",
  "TRANSFER_RAIL_DEPARTURE_STATION",
  "DISEMBARKATION_TIME",
] as const;

/** Questions Viator uses to collect each traveller's own name. */
export const TRAVELLER_NAME_QUESTION_IDS = ["FULL_NAMES_FIRST", "FULL_NAMES_LAST"] as const;

/** Answer unit values for LOCATION_REF_OR_FREE_TEXT questions. */
export const LOCATION_REFERENCE_UNIT = "LOCATION_REFERENCE";
export const FREETEXT_UNIT = "FREETEXT";

export function isPickupQuestion(id: string): boolean {
  return (PICKUP_QUESTION_IDS as readonly string[]).includes(id);
}

export function isTravellerNameQuestion(id: string): boolean {
  return (TRAVELLER_NAME_QUESTION_IDS as readonly string[]).includes(id);
}

export function groupBookingQuestions(questions: readonly BookingQuestion[]): {
  perBooking: BookingQuestion[];
  perTraveller: BookingQuestion[];
  pickup: BookingQuestion[];
  travellerNames: BookingQuestion[];
} {
  return {
    perBooking: questions.filter((q) => q.group === "PER_BOOKING" && !isPickupQuestion(q.id)),
    perTraveller: questions.filter(
      (q) => q.group === "PER_TRAVELER" && !isTravellerNameQuestion(q.id) && !isPickupQuestion(q.id),
    ),
    pickup: questions.filter((q) => isPickupQuestion(q.id)),
    travellerNames: questions.filter((q) => isTravellerNameQuestion(q.id)),
  };
}

/**
 * Answer for PICKUP_POINT. When the product does not allow a custom pickup
 * location the answer must be a location reference, never free text.
 */
export function buildPickupAnswer(input: {
  locationRef?: string | null;
  freeText?: string | null;
  allowCustomTravelerPickup: boolean;
}): BookingQuestionAnswer | { error: string } {
  const ref = (input.locationRef ?? "").trim();
  if (ref) {
    return { question: "PICKUP_POINT", answer: ref, unit: LOCATION_REFERENCE_UNIT };
  }
  const text = (input.freeText ?? "").trim();
  if (!text) return { error: "Choose a pickup point." };
  if (!input.allowCustomTravelerPickup) {
    return { error: "This experience only allows the operator's published pickup points." };
  }
  return { question: "PICKUP_POINT", answer: text, unit: FREETEXT_UNIT };
}

/** Traveller-name answers for every traveller, as Viator expects them. */
export function travellerNameAnswers(
  travellers: readonly { firstName: string; lastName: string }[],
): BookingQuestionAnswer[] {
  const out: BookingQuestionAnswer[] = [];
  travellers.forEach((t, i) => {
    const first = t.firstName.trim();
    const last = t.lastName.trim();
    if (first) out.push({ question: "FULL_NAMES_FIRST", answer: first, travelerNum: i + 1 });
    if (last) out.push({ question: "FULL_NAMES_LAST", answer: last, travelerNum: i + 1 });
  });
  return out;
}

export type AnswerValidation =
  | { ok: true; answers: BookingQuestionAnswer[] }
  | { ok: false; reason: string };

/**
 * Validates answers against the product's question set:
 * mandatory questions answered (per traveller where per-traveller), maxLength
 * and allowedAnswers respected, units valid, unknown ids dropped rather than
 * forwarded to the supplier.
 */
export function validateBookingQuestionAnswers(
  questions: readonly BookingQuestion[],
  answers: readonly BookingQuestionAnswer[],
  travellerCount: number,
): AnswerValidation {
  const byId = new Map(questions.map((q) => [q.id, q] as const));
  const out: BookingQuestionAnswer[] = [];

  for (const raw of answers) {
    const q = byId.get(raw.question);
    if (!q) continue;
    const answer = (raw.answer ?? "").trim();
    if (!answer) continue;
    if (q.maxLength != null && answer.length > q.maxLength) {
      return { ok: false, reason: `“${q.label}” must be ${q.maxLength} characters or fewer.` };
    }
    if (q.allowedAnswers.length && !q.allowedAnswers.includes(answer)) {
      return { ok: false, reason: `“${q.label}” must be one of: ${q.allowedAnswers.join(", ")}.` };
    }
    if (raw.unit && q.units.length && !q.units.includes(raw.unit)) {
      return { ok: false, reason: `“${q.label}” unit must be one of: ${q.units.join(", ")}.` };
    }
    out.push({
      question: q.id,
      answer,
      ...(q.group === "PER_TRAVELER" ? { travelerNum: raw.travelerNum ?? 1 } : {}),
      ...(raw.unit ? { unit: raw.unit } : {}),
    });
  }

  for (const q of questions) {
    if (q.required !== "MANDATORY") continue;
    if (q.group === "PER_TRAVELER") {
      for (let i = 1; i <= Math.max(1, travellerCount); i += 1) {
        if (!out.some((a) => a.question === q.id && (a.travelerNum ?? 1) === i)) {
          return { ok: false, reason: `“${q.label}” is required for traveller ${i}.` };
        }
      }
    } else if (!out.some((a) => a.question === q.id)) {
      return { ok: false, reason: `“${q.label}” is required.` };
    }
  }

  return { ok: true, answers: out };
}
