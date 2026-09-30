// Tour partner new-booking contract — pure and client-safe (no secrets, no I/O).
//
// Every field below was verified against the LIVE partner endpoint on
// 30 Sep 2026 using deliberately invalid requests (past date / unknown tour id)
// that the partner rejects at validation, so no booking could be created. The
// partner returned its own field-level validation messages; nothing here is
// guessed. Anything the partner has NOT confirmed is listed in UNVERIFIED and
// blocks the supplier write.

export const CONTRACT_EVIDENCE = {
  verifiedAt: "2026-09-30",
  method: "Live validation probes on POST new-booking (422 responses; no booking possible)",
  required: [
    "tour_id (integer, must be a valid partner tour id)",
    "pax (integer)",
    "date (YYYY-MM-DD, today or later)",
    "service_type ('regular' | 'private')",
    "buyer_currency (ISO code, e.g. EUR / USD)",
    "customers[] — [0] is the Lead Traveler: title, first_name, last_name, email (valid), phone_code (integer partner country id), phone",
  ],
  optional: ["rooms[] — each { id, pax, count } (partner room ids)"],
  readRequiresToken: "GET booking by reference requires the booking 'token' field",
} as const;

/** Gaps the partner has not confirmed. Each one blocks the supplier write. */
export const UNVERIFIED = {
  phoneCountryIds:
    "phone_code is the partner's own integer country id (e.g. 91 and +91 are rejected, 1 and 2 accepted). The partner has not supplied its id list, so a customer's phone country cannot be mapped.",
  roomIds: "rooms[].id values for multi-day room-priced tours are not published by the partner.",
  successResponse: "The success response shape (reference / token / status) has not been observed — only a real booking reveals it.",
} as const;

/**
 * Partner phone country ids. Deliberately EMPTY until the partner supplies the
 * official list — never fill with guesses. Key: dialling code without '+'.
 */
export const PHONE_COUNTRY_IDS: Readonly<Record<string, number>> = {};

export interface ContractBookingRecord {
  tour_external_id: string | number;
  tour_date: string;
  service_type: string;
  adults: number;
  children: number;
  infants: number;
  rooms: unknown;
  supplier_currency: string;
  lead_traveller: { title?: string; firstName: string; lastName: string; email: string; phone: string; phoneCountryCode?: string };
}

export type ContractResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; blockers: string[] };

const hasRooms = (r: unknown) =>
  Array.isArray(r) ? r.length > 0 : !!r && typeof r === "object" && Object.values(r as Record<string, unknown>).some((v) => Number(v) > 0);

export function buildNewBookingBody(b: ContractBookingRecord, today = new Date().toISOString().slice(0, 10)): ContractResult {
  const blockers: string[] = [];
  const tourId = Number(b.tour_external_id);
  if (!Number.isInteger(tourId) || tourId <= 0) blockers.push("Partner tour id is not an integer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tour_date) || b.tour_date < today) blockers.push("Tour date must be today or later.");
  if (b.service_type !== "regular" && b.service_type !== "private") blockers.push("Unknown service type.");
  if (!/^[A-Z]{3}$/.test(b.supplier_currency ?? "")) blockers.push("Missing partner currency.");
  if (hasRooms(b.rooms)) blockers.push(UNVERIFIED.roomIds);
  const lead = b.lead_traveller;
  if (!lead?.firstName || !lead?.lastName) blockers.push("Lead traveller name missing.");
  if (!lead?.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) blockers.push("Lead traveller email invalid.");
  const dial = (lead?.phoneCountryCode ?? "").replace(/\D/g, "");
  const phoneCountryId = dial ? PHONE_COUNTRY_IDS[dial] : undefined;
  if (!phoneCountryId) blockers.push(UNVERIFIED.phoneCountryIds);
  const phone = (lead?.phone ?? "").replace(/\D/g, "");
  if (phone.length < 5) blockers.push("Lead traveller phone missing.");
  if (blockers.length) return { ok: false, blockers };
  return {
    ok: true,
    body: {
      tour_id: tourId,
      pax: b.adults + b.children,
      date: b.tour_date,
      service_type: b.service_type,
      buyer_currency: b.supplier_currency,
      customers: [{ title: lead.title ?? "Mr", first_name: lead.firstName, last_name: lead.lastName, email: lead.email, phone_code: phoneCountryId, phone }],
    },
  };
}

/** Deterministic gate ladder. A gate is open only if every earlier gate is open. */
export interface GateInput {
  flagEnabled: boolean;
  contractComplete: boolean;
  verifiedStaffBooking: boolean; // a real supplier_booked record created via the staff path after a paid payment
  certified: boolean; // certification grant backed by that evidence
}
export function bookingGates(i: GateInput) {
  const g1 = i.contractComplete;
  const g4 = g1 && i.flagEnabled && i.verifiedStaffBooking;
  const g5 = g4 && i.certified;
  const g6 = g5;
  return [
    { gate: "Booking API contract", open: g1, detail: g1 ? "All fields verified" : Object.values(UNVERIFIED).slice(0, 2).join(" ") },
    { gate: "Gate 4 · Staff-only live booking", open: g4, detail: g4 ? "Verified live booking on record" : !g1 ? "Waiting on contract" : !i.flagEnabled ? "Switch off" : "No verified paid staff booking yet" },
    { gate: "Gate 5 · Certification evidence", open: g5, detail: g5 ? "Certified" : "Needs Gate 4 evidence" },
    { gate: "Gate 6 · Customer booking & checkout", open: g6, detail: g6 ? "Open" : "Closed until Gates 4–5 pass" },
  ];
}

export const contractComplete = () => Object.keys(PHONE_COUNTRY_IDS).length > 0 && false; // success shape still unobserved
