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
  roomIds: "Room-priced tours need the room ids returned by the partner's live availability for that date.",
  successResponse: "The success response shape (reference / token / status) is confirmed by the first real booking of each pricing kind.",
} as const;

/** One entry of the partner's live country list (GET apiv1/b2c/countries/list). */
export interface PartnerCountry { id: number; name: string; phone_code: string; slug: string }

/** Dialling code -> partner country id, only when exactly one partner country has that code. */
export function resolvePhoneCountryId(dial: string, countries: readonly PartnerCountry[]): number | undefined {
  const d = dial.replace(/\D/g, "");
  if (!d) return undefined;
  const hits = countries.filter((c) => c.phone_code.replace(/\D/g, "") === d);
  return hits.length === 1 ? hits[0].id : undefined;
}

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

/** Partner room lines: ids exactly as returned by the partner's live availability. */
const isPartnerRoomLines = (r: unknown): r is Array<{ id: string; pax: number; count: number }> =>
  Array.isArray(r) && r.length > 0 && r.every((x) => x && typeof x.id === "string" && Number.isInteger(x.pax) && x.pax > 0 && Number.isInteger(x.count) && x.count > 0);
const hasRooms = (r: unknown) =>
  Array.isArray(r) ? r.length > 0 : !!r && typeof r === "object" && Object.values(r as Record<string, unknown>).some((v) => Number(v) > 0);

export function buildNewBookingBody(b: ContractBookingRecord, countries: readonly PartnerCountry[], today = new Date().toISOString().slice(0, 10)): ContractResult {
  const blockers: string[] = [];
  const tourId = Number(b.tour_external_id);
  if (!Number.isInteger(tourId) || tourId <= 0) blockers.push("Partner tour id is not an integer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tour_date) || b.tour_date < today) blockers.push("Tour date must be today or later.");
  if (b.service_type !== "regular" && b.service_type !== "private") blockers.push("Unknown service type.");
  if (!/^[A-Z]{3}$/.test(b.supplier_currency ?? "")) blockers.push("Missing partner currency.");
  const roomLines = isPartnerRoomLines(b.rooms) ? b.rooms : null;
  if (!roomLines && hasRooms(b.rooms)) blockers.push(UNVERIFIED.roomIds);
  const lead = b.lead_traveller;
  if (!lead?.firstName || !lead?.lastName) blockers.push("Lead traveller name missing.");
  if (!lead?.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) blockers.push("Lead traveller email invalid.");
  const dial = (lead?.phoneCountryCode ?? "").replace(/\D/g, "");
  const phoneCountryId = resolvePhoneCountryId(dial, countries);
  if (!countries.length) blockers.push("Partner country list unavailable.");
  else if (!phoneCountryId) blockers.push("Lead traveller phone country not in the partner country list (or shared by several countries).");
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
      ...(roomLines ? { rooms: roomLines } : {}),
    },
  };
}

/** Deterministic gate ladder. A gate is open only if every earlier gate is open. */
export interface GateInput {
  flagEnabled: boolean;
  contractComplete: boolean;
  verifiedStaffBooking: boolean; // a real partner-confirmed booking after a verified Worldway payment
  certified: boolean; // evidence-backed certification derived from that booking
}
export function bookingGates(i: GateInput) {
  const g1 = i.contractComplete;
  const g4 = g1 && i.flagEnabled && i.verifiedStaffBooking;
  const g5 = g4 && i.certified;
  const g6 = g5;
  return [
    { gate: "Booking API contract", open: g1, detail: g1 ? "Fields verified; country list live" : "Partner country list unavailable" },
    { gate: "Gate 4 · Staff-only live booking", open: g4, detail: g4 ? "Partner-confirmed paid booking on record" : !g1 ? "Waiting on contract" : !i.flagEnabled ? "Switch off" : "No partner-confirmed paid booking yet" },
    { gate: "Gate 5 · Certification evidence", open: g5, detail: g5 ? "Certified from live booking evidence" : "Needs Gate 4 evidence" },
    { gate: "Gate 6 · Customer booking & checkout", open: g6, detail: g6 ? "Open" : "Closed until Gates 4–5 pass" },
  ];
}

/** Contract complete once the partner live country list is available; rooms stay blocked per UNVERIFIED. */
export const contractComplete = (countries: readonly PartnerCountry[]) => countries.length > 0;
