// TripJack TripSafe API v5.1 — client-safe contract types and payload builders.
// Field names are verbatim from the supplier documentation. All builders are
// pure so they can be unit-tested and so the wire format can never drift.
import {
  TRIPSAFE_BLOCKED_COUNTRIES,
  TRIPSAFE_CANCELLATION_CUTOFF_HOURS,
  TRIPSAFE_MAX_AGE,
  TRIPSAFE_MAX_COVERAGE_DAYS,
  TRIPSAFE_MAX_TRAVELLERS,
  type TripsafeChannelType,
} from "./config";

export type TripsafeRegion = {
  rkey: string;
  rt: "COUNTRY" | "POPULARREGION";
};

export type TripsafeSearchTraveller = {
  age: number;
};

/** TripSafe v5.1 §3 Search API request. */
export type TripsafeSearchRequest = {
  isq: {
    /** Coverage start date, yyyy-MM-dd. */
    sd: string;
    /** Coverage end date, yyyy-MM-dd. Omitted for STUDENT (uses cd). */
    ed?: string;
    /** Coverage duration in days — STUDENT plans only (180/365/730/1095). */
    cd?: string;
    isc: { iri: TripsafeRegion[] };
    iti: TripsafeSearchTraveller[];
    isp?: { pht?: string };
    /** Embedded flow flag. */
    isef?: boolean;
    /** Insurance channel type: REGULAR (default) / STUDENT / AMT. */
    ict?: TripsafeChannelType;
    /** AMT per-trip duration in days (30/45/60/90). */
    adr?: string;
  };
  /** Air booking id — embedded flow only. */
  bid?: string;
};

/** Insurance fare component (TripSafe v5.1 §3 "Ifc"). */
export type TripsafeIfc = {
  TF?: number;
  NF?: number;
  SP?: number;
  BF?: number;
  AC?: number;
  IP?: number;
  AP?: number;
  [key: string]: number | undefined;
};

/** Product benefit (TripSafe v5.1 §3 "pbft"). */
export type TripsafeBenefit = {
  bv?: string;
  name?: string;
  type?: string;
  bfp?: string;
  dsc?: string;
  ic?: string;
  sumins?: string;
};

/** Product info (TripSafe v5.1 §3 "pi") as returned by Search / Review. */
export type TripsafePlan = {
  pid?: string;
  /** Product name — the cover amount, e.g. "$500,000". */
  pn?: string;
  /** Product identifier / tier, e.g. "Titanium". */
  pi?: string;
  /** Insurance provider, e.g. "ABHI". */
  ip?: string;
  aps?: string[];
  rname?: string;
  pbft?: TripsafeBenefit[];
  /** Product fare details: day number → per-age fare components. */
  pfd?: { ppd?: { ppdf?: Record<string, Array<{ age?: number; ifc?: TripsafeIfc }>> } };
  /** Total fare detail (Review response). */
  tfd?: { ifc?: TripsafeIfc };
  iti?: Array<{ id?: number; age?: number; fd?: { ifc?: TripsafeIfc }; policyId?: string; fn?: string; ln?: string }>;
  ptf?: number;
  [key: string]: unknown;
};

export type TripsafePlanGroup = { plid?: string; pi?: TripsafePlan[]; pltype?: string };

export type TripsafeSearchResponse = {
  isq?: TripsafeSearchRequest["isq"] & { searchId?: string; pci?: Record<string, number> };
  isr?: { iinfo?: { pli?: TripsafePlanGroup[] } };
  searchId?: string;
  status?: { success?: boolean; httpStatus?: number };
  errors?: Array<{ errCode?: string; message?: string; details?: string }>;
};

export type TripsafePlanSummary = {
  pid: string;
  plid: string;
  name: string;
  tier?: string;
  insurer?: string;
  region?: string;
  /** Indicative total from the search fare table; the Review fare is authoritative. */
  totalFare?: number;
  currency: string;
  sumInsured?: string;
  benefits: Array<{ name: string; value: string }>;
};

/**
 * Derives the indicative total fare from `pfd.ppd.ppdf` (day number → fare
 * rows per traveller). The highest day key is the full coverage duration, so
 * the sum of its `TF` rows is the fare for all travellers. Returns undefined
 * when the supplier gives no fare — never invents a price.
 */
export function tripsafeIndicativeFare(plan: TripsafePlan): number | undefined {
  const direct = plan.tfd?.ifc?.TF;
  if (typeof direct === "number") return direct;
  const ppdf = plan.pfd?.ppd?.ppdf;
  if (!ppdf) return undefined;
  const keys = Object.keys(ppdf)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  if (!keys.length) return undefined;
  const rows = ppdf[String(Math.max(...keys))] ?? [];
  let total = 0;
  let seen = false;
  for (const r of rows) {
    if (typeof r.ifc?.TF === "number") {
      total += r.ifc.TF;
      seen = true;
    }
  }
  return seen ? Math.round(total * 100) / 100 : undefined;
}

export function summariseTripsafePlan(plid: string, plan: TripsafePlan): TripsafePlanSummary | null {
  if (!plan.pid) return null;
  return {
    pid: plan.pid,
    plid,
    name: [plan.pi, plan.pn].filter(Boolean).join(" · ") || plan.pid,
    tier: plan.pi,
    insurer: plan.ip,
    region: plan.rname,
    totalFare: tripsafeIndicativeFare(plan),
    currency: "INR",
    sumInsured: plan.pn,
    benefits: (plan.pbft ?? [])
      .filter((b) => b.name)
      .map((b) => ({ name: b.name ?? "", value: b.sumins ?? b.dsc ?? b.bfp ?? "" })),
  };
}

export function flattenTripsafePlans(res: TripsafeSearchResponse): TripsafePlanSummary[] {
  const out: TripsafePlanSummary[] = [];
  for (const group of res.isr?.iinfo?.pli ?? []) {
    if (!group.plid) continue;
    for (const p of group.pi ?? []) {
      const s = summariseTripsafePlan(group.plid, p);
      if (s) out.push(s);
    }
  }
  return out;
}

/** Traveller as captured by Worldway; mapped onto the documented `iti` block. */
export type TripsafeTraveller = {
  id?: number;
  ti: string;
  fn: string;
  ln: string;
  age: number;
  dob: string;
  eid?: string;
  cnum?: string;
  pnum?: string;
  pincode?: string;
  /** Gender, documented values M / F. */
  gen?: "M" | "F";
  isio?: boolean;
  nomineeName?: string;
  nomineeRelation?: string;
};

/** Everything Worldway needs to run Review → Book for one plan. */
export type TripsafeSelection = {
  plid: string;
  pid: string;
  sd: string;
  ed?: string;
  cd?: string;
  iti: TripsafeTraveller[];
  /** Air booking id — embedded flow only. */
  refid?: string;
};

/** TripSafe v5.1 §3 Review API request (standalone). */
export type TripsafeReviewRequest = { pli: Array<{ plid: string; pi: Array<{ pid: string }> }> };

export function buildTripsafeReviewBody(sel: Pick<TripsafeSelection, "plid" | "pid">): TripsafeReviewRequest {
  return { pli: [{ plid: sel.plid, pi: [{ pid: sel.pid }] }] };
}

export type TripsafeReviewResponse = {
  bid?: string;
  isq?: Record<string, unknown>;
  iinfo?: { pli?: TripsafePlanGroup[] };
  status?: { success?: boolean; httpStatus?: number };
  errors?: Array<{ errCode?: string; message?: string; details?: string }>;
  [key: string]: unknown;
};

/** Extracts `bid` and the authoritative total fare (`tfd.ifc.TF`) from Review. */
export function extractTripsafeReview(raw: TripsafeReviewResponse): { bid?: string; totalFare?: number } {
  const plan = raw.iinfo?.pli?.[0]?.pi?.[0];
  let totalFare = plan?.tfd?.ifc?.TF;
  if (typeof totalFare !== "number" && plan?.iti?.length) {
    let sum = 0;
    let seen = false;
    for (const t of plan.iti) {
      if (typeof t.fd?.ifc?.TF === "number") {
        sum += t.fd.ifc.TF;
        seen = true;
      }
    }
    totalFare = seen ? Math.round(sum * 100) / 100 : undefined;
  }
  return { bid: typeof raw.bid === "string" ? raw.bid : undefined, totalFare };
}

/** Documented traveller block of the Booking API. */
export type TripsafeBookTraveller = {
  id: number;
  dob: string;
  age: number;
  fn: string;
  ln: string;
  eid?: string;
  pnum?: string;
  pincode?: string;
  gen?: "M" | "F";
  ni?: Array<{ nn: string; nr: string }>;
};

/** TripSafe v5.1 §3 Booking API request. */
export type TripsafeBookRequest = {
  bookingId: string;
  paymentInfos: Array<{ paymentMedium: "WALLET"; amount: number }>;
  pli: Array<{ plid: string; pi: Array<{ pid: string; iti: TripsafeBookTraveller[] }> }>;
  deliveryInfo: { emails: string[]; contacts: string[] };
};

export function toBookTraveller(t: TripsafeTraveller, index: number): TripsafeBookTraveller {
  const out: TripsafeBookTraveller = {
    id: t.id ?? index + 1,
    dob: t.dob,
    age: t.age,
    fn: t.fn.trim(),
    ln: t.ln.trim(),
  };
  if (t.eid) out.eid = t.eid;
  if (t.pnum) out.pnum = t.pnum;
  if (t.pincode) out.pincode = t.pincode;
  if (t.gen) out.gen = t.gen;
  if (t.nomineeName && t.nomineeRelation) out.ni = [{ nn: t.nomineeName, nr: t.nomineeRelation }];
  return out;
}

/**
 * Builds the documented Booking payload. `bid` and `amount` must come from the
 * Review response; travellers must match the Review/Search exactly.
 */
export function buildTripsafeBookBody(input: {
  bid: string;
  amount: number;
  selection: TripsafeSelection;
}): TripsafeBookRequest {
  const { selection } = input;
  const emails = Array.from(new Set(selection.iti.map((t) => t.eid).filter((v): v is string => Boolean(v))));
  const contacts = Array.from(new Set(selection.iti.map((t) => t.cnum).filter((v): v is string => Boolean(v))));
  return {
    bookingId: input.bid,
    paymentInfos: [{ paymentMedium: "WALLET", amount: input.amount }],
    pli: [
      {
        plid: selection.plid,
        pi: [{ pid: selection.pid, iti: selection.iti.map(toBookTraveller) }],
      },
    ],
    deliveryInfo: { emails, contacts },
  };
}

export type TripsafeBookResponse = {
  bid?: string;
  bookingId?: string;
  status?: { success?: boolean; httpStatus?: number } | string;
  errors?: Array<{ errCode?: string; message?: string; details?: string }>;
  [key: string]: unknown;
};

/** True only when the documented `status.success` flag is literally true. */
export function tripsafeBookSucceeded(raw: TripsafeBookResponse | undefined): boolean {
  if (!raw) return false;
  if (typeof raw.status === "object" && raw.status) return raw.status.success === true;
  if (typeof raw.status === "string") return raw.status.toUpperCase() === "SUCCESS";
  return false;
}

/** travellerKeys: { [plid]: { [pid]: [{ id }] } } */
export type TripsafeTravellerKeys = Record<string, Record<string, Array<{ id: number }>>>;

export function buildTravellerKeys(plid: string, pid: string, travellerIds: number[]): TripsafeTravellerKeys {
  return { [plid]: { [pid]: travellerIds.map((id) => ({ id })) } };
}

/** TripSafe v5.1 §3 Raise-Amendments API request. */
export type TripsafeRaiseAmendmentRequest = {
  amendmentId: "";
  bookingId: string;
  type: "CANCELLATION";
  travellerKeys: TripsafeTravellerKeys;
};

export function buildTripsafeRaiseBody(bookingId: string, keys: TripsafeTravellerKeys): TripsafeRaiseAmendmentRequest {
  return { amendmentId: "", bookingId, type: "CANCELLATION", travellerKeys: keys };
}

/** TripSafe v5.1 §3 Cancellation API request. */
export type TripsafeConfirmCancellationRequest = {
  amendmentId: string;
  bookingId: string;
  type: "INSURANCE_CANCELLATION";
  travellerKeys: TripsafeTravellerKeys;
};

export function buildTripsafeConfirmBody(
  amendmentId: string,
  bookingId: string,
  keys: TripsafeTravellerKeys,
): TripsafeConfirmCancellationRequest {
  return { amendmentId, bookingId, type: "INSURANCE_CANCELLATION", travellerKeys: keys };
}

export type TripsafeAmendmentResponse = {
  amendmentItems?: Array<{ amendmentId?: string; bookingId?: string; status?: string; amount?: number }>;
  errors?: Array<{ errCode?: string; message?: string; details?: string }>;
  [key: string]: unknown;
};

export function extractAmendment(raw: TripsafeAmendmentResponse | undefined, bookingId: string) {
  const items = raw?.amendmentItems ?? [];
  return items.find((i) => i.bookingId === bookingId) ?? items[0];
}

/** Per-traveller policy ids surfaced by Booking Details (`iti[].policyId`). */
export type TripsafePolicyRecord = { travellerId?: number; fn?: string; ln?: string; policyId: string; plid?: string; pid?: string };

export function extractTripsafePolicies(details: unknown): TripsafePolicyRecord[] {
  const d = (details ?? {}) as { itemInfos?: { INSURANCE?: { iinfo?: { pli?: TripsafePlanGroup[] } } } };
  const out: TripsafePolicyRecord[] = [];
  for (const group of d.itemInfos?.INSURANCE?.iinfo?.pli ?? []) {
    for (const p of group.pi ?? []) {
      for (const t of p.iti ?? []) {
        if (t.policyId) out.push({ travellerId: t.id, fn: t.fn, ln: t.ln, policyId: t.policyId, plid: group.plid, pid: p.pid });
      }
    }
  }
  return out;
}

/**
 * TripSafe v5.1 FAQ: amendments/cancellations must be raised at least 24 hours
 * before the coverage start date. Evaluated server-side before any supplier
 * call. `sd` is yyyy-MM-dd; coverage is treated as starting at 00:00 IST.
 */
export function tripsafeCancellationDeadline(sd: string): Date {
  const start = Date.parse(`${sd}T00:00:00+05:30`);
  return new Date(start - TRIPSAFE_CANCELLATION_CUTOFF_HOURS * 3_600_000);
}

export function isTripsafeCancellable(sd: string, now: Date = new Date()): boolean {
  const deadline = tripsafeCancellationDeadline(sd);
  return Number.isFinite(deadline.getTime()) && now.getTime() <= deadline.getTime();
}

export function mapInsuranceStatus(supplierStatus: string | undefined): string {
  switch ((supplierStatus ?? "").toUpperCase()) {
    case "SUCCESS":
    case "CONFIRMED":
    case "BOOKED":
      return "confirmed";
    case "PENDING":
    case "ON_HOLD":
    case "HOLD":
    case "REQUESTED":
      return "pending";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * TripSafe v5.1 §4 "API Request Validation Rules". These are supplier-mandated
 * pre-flight validations; failing them must not reach UAT.
 */
export function validateTripsafeSearch(req: TripsafeSearchRequest): string | null {
  const { isq } = req;
  if (!isq?.sd) return "Coverage start date is required.";
  if (!isq.isc?.iri?.length) return "At least one destination region is required.";
  if (!isq.iti?.length) return "At least one traveller is required.";
  if (isq.iti.length > TRIPSAFE_MAX_TRAVELLERS) {
    return `A maximum of ${TRIPSAFE_MAX_TRAVELLERS} travellers is allowed per search.`;
  }
  if (isq.iti.some((t) => !Number.isFinite(t.age) || t.age < 0)) {
    return "Every traveller needs a valid age.";
  }
  if (isq.iti.some((t) => t.age > TRIPSAFE_MAX_AGE)) {
    return `Travellers above ${TRIPSAFE_MAX_AGE} years of age cannot be covered.`;
  }
  const blocked = isq.isc.iri.find(
    (r) =>
      r.rt === "COUNTRY" &&
      (TRIPSAFE_BLOCKED_COUNTRIES as readonly string[]).includes(r.rkey.toUpperCase()),
  );
  if (blocked) return `Cover is not available for destination ${blocked.rkey}.`;

  const channel = isq.ict ?? "REGULAR";
  if (channel === "STUDENT") {
    if (!isq.cd) return "Student cover requires a coverage duration.";
    if (isq.iti.some((t) => t.age < 18 || t.age > 45)) {
      return "Student cover is limited to travellers aged 18 to 45.";
    }
    return null;
  }
  if (channel === "AMT") {
    if (!isq.adr) return "Annual Multi-Trip cover requires a per-trip duration.";
    return null;
  }
  if (!isq.ed) return "Coverage end date is required.";
  const days = Math.round(
    (Date.parse(`${isq.ed}T00:00:00Z`) - Date.parse(`${isq.sd}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(days) || days < 0) return "Coverage end date must follow the start date.";
  if (days > TRIPSAFE_MAX_COVERAGE_DAYS) {
    return `Coverage duration must not exceed ${TRIPSAFE_MAX_COVERAGE_DAYS} days.`;
  }
  return null;
}

/** Documented placeholder names that TripJack rejects at certification. */
const PLACEHOLDER_NAMES = new Set(["TBA", "TEST", "TESTING", "NA", "N/A", "XXX", "XXXX", "DUMMY", "SAMPLE"]);

/** Pre-flight for Book: real names, DOB, nominee and delivery contact present. */
export function validateTripsafeSelection(sel: TripsafeSelection): string | null {
  if (!sel.plid || !sel.pid) return "A plan must be selected.";
  if (!sel.iti.length) return "At least one traveller is required.";
  for (const [i, t] of sel.iti.entries()) {
    const n = i + 1;
    if (!t.fn?.trim() || !t.ln?.trim()) return `Traveller ${n} needs a first and last name.`;
    if (PLACEHOLDER_NAMES.has(t.fn.trim().toUpperCase()) || PLACEHOLDER_NAMES.has(t.ln.trim().toUpperCase())) {
      return `Traveller ${n} must have a real name — placeholder names are rejected by the insurer.`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dob)) return `Traveller ${n} needs a date of birth.`;
    if (!t.gen) return `Traveller ${n} needs a gender (M/F).`;
    if (!t.nomineeName?.trim() || !t.nomineeRelation) return `Traveller ${n} needs a nominee name and relation.`;
  }
  if (!sel.iti.some((t) => t.eid)) return "A delivery email address is required.";
  if (!sel.iti.some((t) => t.cnum)) return "A delivery contact number is required.";
  return null;
}
