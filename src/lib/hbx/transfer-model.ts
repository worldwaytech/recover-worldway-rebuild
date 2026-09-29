// HBX Transfers — client-safe model, request builders, normalisers and voucher.
//
// Pure functions only (no network, no secrets) so they can be unit tested and
// shared between the server adapter and the customer UI. Field names follow the
// HBX Transfers Booking API 1.0 responses observed on the TEST environment.

export type TransferPointType = "ATLAS" | "IATA" | "PORT" | "STATION" | "GIATA" | "GPS";
export type TransferDirection = "DEPARTURE" | "ARRIVAL" | "RETURN";
export type TransportDetailType = "FLIGHT" | "TRAIN" | "CRUISE";

export interface TransferPointRef {
  type: TransferPointType;
  /** Code for coded points, or "lat,lng" for GPS. */
  code: string;
  name?: string | null;
}

export interface TransferAvailabilityQuery {
  language?: string;
  from: TransferPointRef;
  to: TransferPointRef;
  /** Local datetime, YYYY-MM-DDTHH:mm[:ss]. */
  outbound: string;
  /** Optional return datetime: presence makes the search a round trip. */
  inbound?: string | null;
  adults: number;
  children: number;
  infants: number;
}

const POINT_CODE = /^[A-Za-z0-9-]{1,20}$/;
const GPS_CODE = /^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;
const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function dt(v: string): string {
  if (!LOCAL_DT.test(v)) throw new Error("Transfer date/time must be YYYY-MM-DDTHH:mm.");
  return v.length === 16 ? `${v}:00` : v;
}

function point(p: TransferPointRef): string {
  const ok = p.type === "GPS" ? GPS_CODE.test(p.code) : POINT_CODE.test(p.code);
  if (!ok) throw new Error(`Invalid ${p.type} transfer point.`);
  return `${p.type}/${p.code}`; // validated above; commas/colons must stay literal
}

/** Builds the documented availability path:
 *  /availability/{lang}/from/{type}/{code}/to/{type}/{code}/{outbound}[/{inbound}]/{adults}/{children}/{infants} */
export function buildAvailabilityPath(q: TransferAvailabilityQuery): string {
  if (q.adults < 1 || q.adults > 99) throw new Error("At least one adult is required.");
  if (q.children < 0 || q.infants < 0) throw new Error("Invalid children/infants.");
  const legs = [dt(q.outbound)];
  if (q.inbound) legs.push(dt(q.inbound));
  return [
    `/availability/${q.language ?? "en"}`,
    `from/${point(q.from)}`,
    `to/${point(q.to)}`,
    ...legs,
    String(q.adults),
    String(q.children),
    String(q.infants),
  ].join("/");
}

// ------------------------------------------------------------------ DTOs

export interface TransferCancellationPolicy {
  amount: number;
  currency: string;
  /** Local date/time at destination from which the charge applies. */
  from: string;
  utcOffset: string | null;
  /** Same instant expressed in UTC ISO, when an offset is supplied. */
  fromUtc: string | null;
}

export interface TransferExtra {
  code: string;
  name: string;
  amount: number;
  units?: number;
}

export interface TransferDetailInfo {
  id: string;
  name: string;
  description: string;
  type: string;
  value: string | null;
}

export interface TransferCheckPickup {
  mustCheckPickupTime: boolean;
  url: string | null;
  hoursBeforeConsulting: number | null;
}

export interface TransferPickupInfo {
  fromName: string | null;
  fromType: string | null;
  fromCode: string | null;
  toName: string | null;
  toType: string | null;
  toCode: string | null;
  date: string | null;
  time: string | null;
  address: string | null;
  town: string | null;
  zip: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  stopName: string | null;
  image: string | null;
  checkPickup: TransferCheckPickup | null;
}

export interface TransferOption {
  id: string;
  rateKey: string;
  direction: TransferDirection | string;
  transferType: "PRIVATE" | "SHARED" | string;
  vehicle: { code: string; name: string };
  category: { code: string; name: string };
  images: { url: string; type: string }[];
  minPax: number | null;
  maxPax: number | null;
  vehiclesNumber: number | null;
  price: { total: number; net: number | null; currency: string };
  pickup: TransferPickupInfo;
  remarks: { type: string; description: string; mandatory: boolean }[];
  details: TransferDetailInfo[];
  supplierTimes: { type: string; value: string | null; metric: string | null; remarks: string | null }[];
  customerTimes: { type: string; value: string | null; metric: string | null; remarks: string | null }[];
  cancellationPolicies: TransferCancellationPolicy[];
  extras: TransferExtra[];
  factsheetId: number | null;
}

export interface TransferAvailability {
  search: {
    from: { code: string; name: string; type: string } | null;
    to: { code: string; name: string; type: string } | null;
    departure: { date: string; time: string } | null;
    comeBack: { date: string; time: string } | null;
    occupancy: { adults: number; children: number; infants: number };
  };
  outbound: TransferOption[];
  inbound: TransferOption[];
}

type R = Record<string, unknown>;
const o = (v: unknown): R => (v && typeof v === "object" ? (v as R) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);
const n = (v: unknown): number | null => {
  const x = typeof v === "number" ? v : v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Converts a local destination time + "+01:00" offset to a UTC ISO string. */
export function policyUtc(from: string, utcOffset: string | null): string | null {
  if (!from || !utcOffset || !/^[+-]\d{2}:\d{2}$/.test(utcOffset)) return null;
  const d = new Date(`${from.length === 16 ? `${from}:00` : from}${utcOffset}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normPolicy(p: unknown, fallbackCurrency: string): TransferCancellationPolicy {
  const r = o(p);
  const from = s(r["from"]) ?? "";
  const utcOffset = s(r["utcOffset"]);
  return {
    amount: n(r["amount"]) ?? 0,
    currency: s(r["currencyId"]) ?? fallbackCurrency,
    from,
    utcOffset,
    fromUtc: policyUtc(from, utcOffset),
  };
}

function normPickup(pi: unknown): TransferPickupInfo {
  const r = o(pi);
  const from = o(r["from"]);
  const to = o(r["to"]);
  const pk = o(r["pickup"]);
  const cp = o(pk["checkPickup"]);
  return {
    fromName: s(from["description"]),
    fromType: s(from["type"]),
    fromCode: s(from["code"]),
    toName: s(to["description"]),
    toType: s(to["type"]),
    toCode: s(to["code"]),
    date: s(r["date"]),
    time: s(r["time"]),
    address: s(pk["address"]),
    town: s(pk["town"]),
    zip: s(pk["zip"]),
    description: s(pk["description"])?.trim() ?? null,
    latitude: n(pk["latitude"]),
    longitude: n(pk["longitude"]),
    stopName: s(pk["stopName"]),
    image: s(pk["image"]),
    checkPickup: pk["checkPickup"]
      ? {
          mustCheckPickupTime: cp["mustCheckPickupTime"] === true,
          url: s(cp["url"]),
          hoursBeforeConsulting: n(cp["hoursBeforeConsulting"]),
        }
      : null,
  };
}

function normTimes(v: unknown) {
  return a(v).map((t) => {
    const r = o(t);
    return { type: s(r["type"]) ?? "", value: s(r["value"]), metric: s(r["metric"]), remarks: s(r["remarks"]) };
  });
}

/** Normalises one availability service (or one booked transfer). */
export function normaliseTransferService(raw: unknown): TransferOption {
  const r = o(raw);
  const content = o(r["content"]);
  const price = o(r["price"]);
  const currency = s(price["currencyId"]) ?? "";
  const vehicle = o(r["vehicle"]);
  const category = o(r["category"]);
  return {
    id: s(r["id"]) ?? "",
    rateKey: s(r["rateKey"]) ?? "",
    direction: s(r["direction"]) ?? "",
    transferType: s(r["transferType"]) ?? "",
    vehicle: { code: s(vehicle["code"]) ?? "", name: s(vehicle["name"]) ?? s(o(content["vehicle"])["name"]) ?? "" },
    category: {
      code: s(category["code"]) ?? "",
      name: s(category["name"]) ?? s(o(content["category"])["name"]) ?? "",
    },
    images: a(content["images"]).map((i) => ({ url: s(o(i)["url"]) ?? "", type: s(o(i)["type"]) ?? "" })).filter((i) => i.url),
    minPax: n(r["minPaxCapacity"]),
    maxPax: n(r["maxPaxCapacity"]),
    vehiclesNumber: n(r["vehiclesNumber"]),
    price: { total: n(price["totalAmount"]) ?? 0, net: n(price["netAmount"]), currency },
    pickup: normPickup(r["pickupInformation"]),
    remarks: a(content["transferRemarks"]).map((x) => {
      const m = o(x);
      return { type: s(m["type"]) ?? "", description: (s(m["description"]) ?? "").trim(), mandatory: m["mandatory"] === true };
    }),
    details: a(content["transferDetailInfo"]).map((x) => {
      const m = o(x);
      return {
        id: s(m["id"]) ?? "",
        name: s(m["name"]) ?? "",
        description: s(m["description"]) ?? "",
        type: s(m["type"]) ?? "",
        value: s(m["value"]),
      };
    }),
    supplierTimes: normTimes(content["supplierTransferTimeInfo"]),
    customerTimes: normTimes(content["customerTransferTimeInfo"]),
    cancellationPolicies: a(r["cancellationPolicies"]).map((p) => normPolicy(p, currency)),
    extras: a(r["extras"]).map((x) => {
      const m = o(x);
      const units = n(m["units"]);
      return {
        code: s(m["code"]) ?? "",
        name: s(m["type"]) ?? s(m["name"]) ?? "",
        amount: n(m["amount"]) ?? 0,
        ...(units !== null ? { units } : {}),
      };
    }),
    factsheetId: n(r["factsheetId"]),
  };
}

export function normaliseAvailability(raw: unknown): TransferAvailability {
  const r = o(raw);
  const search = o(r["search"]);
  const pt = (v: unknown) => {
    const m = o(v);
    return m["code"] ? { code: s(m["code"])!, name: s(m["description"]) ?? "", type: s(m["type"]) ?? "" } : null;
  };
  const leg = (v: unknown) => {
    const m = o(v);
    const date = s(m["date"]);
    // HBX returns "-999999999-01-01" when there is no return leg.
    return date && !date.startsWith("-") ? { date, time: s(m["time"]) ?? "" } : null;
  };
  const occ = o(search["occupancy"]);
  const services = a(r["services"]).map(normaliseTransferService);
  const comeBack = leg(search["comeBack"]);
  const toCode = s(o(search["to"])["code"]);
  // Round trips return both legs in one list: the return leg is picked up at
  // the search destination. One-way searches are all outbound.
  const isInbound = (x: TransferOption) => Boolean(comeBack && toCode && x.pickup.fromCode === toCode);
  return {
    search: {
      from: pt(search["from"]),
      to: pt(search["to"]),
      departure: leg(search["departure"]),
      comeBack,
      occupancy: { adults: n(occ["adults"]) ?? 0, children: n(occ["children"]) ?? 0, infants: n(occ["infants"]) ?? 0 },
    },
    outbound: services.filter((x) => !isInbound(x)),
    inbound: services.filter(isInbound),
  };
}

// --------------------------------------------------------------- booking

export interface TransferHolder {
  name: string;
  surname: string;
  email: string;
  phone: string;
}

export interface TransferBookingLeg {
  rateKey: string;
  /** Flight / train / vessel reference for this leg. */
  transportType: TransportDetailType;
  transportCode: string;
  companyName?: string | null;
  direction: "ARRIVAL" | "DEPARTURE";
  extras?: { code: string; units: number }[];
  /** For GPS searches: the precise pickup / drop-off address. */
  gps?: { pickupAddress?: string | null; dropoffAddress?: string | null } | null;
}

export interface TransferBookingInput {
  language?: string;
  holder: TransferHolder;
  legs: TransferBookingLeg[];
  clientReference: string;
  remark?: string | null;
  welcomeMessage?: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{6,20}$/;
// HBX: flight/train numbers are 1–7 chars (letters, digits, spaces, hyphens);
// vessel names may be longer.
const TRANSPORT_SHORT = /^[A-Za-z0-9 -]{1,7}$/;
const TRANSPORT_VESSEL = /^[A-Za-z0-9 -]{1,40}$/;

export function validateBookingInput(b: TransferBookingInput): string[] {
  const errs: string[] = [];
  if (!b.holder.name.trim() || !b.holder.surname.trim()) errs.push("Lead passenger first and last name are required.");
  if (!EMAIL.test(b.holder.email)) errs.push("A valid lead passenger email is required.");
  if (!PHONE.test(b.holder.phone)) errs.push("A valid lead passenger phone number is required.");
  if (!b.legs.length || b.legs.length > 2) errs.push("Select one or two transfer legs.");
  if (!/^[A-Za-z0-9-]{1,20}$/.test(b.clientReference)) errs.push("Invalid client reference.");
  for (const l of b.legs) {
    if (!l.rateKey) errs.push("A selected transfer is missing its rate.");
    if (!(l.transportType === "CRUISE" ? TRANSPORT_VESSEL : TRANSPORT_SHORT).test(l.transportCode.trim())) errs.push(`A ${l.transportType.toLowerCase()} number is required for each leg.`);
    for (const e of l.extras ?? []) if (!e.code || e.units < 1 || e.units > 20) errs.push("Invalid extra selection.");
  }
  if ((b.remark ?? "").length > 500) errs.push("Remarks are limited to 500 characters.");
  return errs;
}

/** Builds the POST /bookings payload. The holder is always sent — HBX lists
 *  the holder as the lead passenger of every transfer in the booking. */
export function buildBookingBody(b: TransferBookingInput): Record<string, unknown> {
  const remarkParts = [b.remark?.trim()].filter(Boolean) as string[];
  for (const l of b.legs) {
    if (l.gps?.pickupAddress) remarkParts.push(`Pickup address: ${l.gps.pickupAddress.trim()}`);
    if (l.gps?.dropoffAddress) remarkParts.push(`Drop-off address: ${l.gps.dropoffAddress.trim()}`);
  }
  return {
    language: b.language ?? "en",
    holder: {
      name: b.holder.name.trim(),
      surname: b.holder.surname.trim(),
      email: b.holder.email.trim(),
      phone: b.holder.phone.trim(),
    },
    transfers: b.legs.map((l) => ({
      rateKey: l.rateKey,
      transferDetails: [
        {
          type: l.transportType,
          direction: l.direction,
          code: l.transportCode.trim().toUpperCase(),
          companyName: l.companyName?.trim() || null,
        },
      ],
      ...(l.extras?.length ? { extras: l.extras.map((e) => ({ code: e.code, units: e.units })) } : {}),
    })),
    clientReference: b.clientReference,
    ...(b.welcomeMessage ? { welcomeMessage: b.welcomeMessage } : {}),
    remark: remarkParts.join(" | ").slice(0, 1000),
  };
}

export interface TransferBookingRecord {
  reference: string;
  status: string;
  creationDate: string | null;
  clientReference: string | null;
  remark: string | null;
  holder: TransferHolder;
  totalAmount: number;
  pendingAmount: number | null;
  currency: string;
  cancellable: boolean;
  supplierName: string | null;
  supplierVat: string | null;
  transfers: (TransferOption & {
    status: string;
    paxes: { type: string; age: number | null }[];
    transferDetails: { type: string; direction: string; code: string; companyName: string | null }[];
    extrasAmount: number | null;
  })[];
}

export function normaliseBooking(raw: unknown): TransferBookingRecord | null {
  const b = o(a(o(raw)["bookings"])[0]);
  if (!b["reference"]) return null;
  const holder = o(b["holder"]);
  const supplier = o(b["supplier"]);
  return {
    reference: s(b["reference"])!,
    status: s(b["status"]) ?? "",
    creationDate: s(b["creationDate"]),
    clientReference: s(b["clientReference"]),
    remark: s(b["remark"]),
    holder: {
      name: s(holder["name"]) ?? "",
      surname: s(holder["surname"]) ?? "",
      email: s(holder["email"]) ?? "",
      phone: s(holder["phone"]) ?? "",
    },
    totalAmount: n(b["totalAmount"]) ?? 0,
    pendingAmount: n(b["pendingAmount"]),
    currency: s(b["currency"]) ?? "",
    cancellable: o(b["modificationsPolicies"])["cancellation"] === true,
    supplierName: s(supplier["name"]),
    supplierVat: s(supplier["vatNumber"]),
    transfers: a(b["transfers"]).map((t) => {
      const r = o(t);
      return {
        ...normaliseTransferService(t),
        status: s(r["status"]) ?? "",
        paxes: a(r["paxes"]).map((p) => ({ type: s(o(p)["type"]) ?? "", age: n(o(p)["age"]) })),
        transferDetails: a(r["transferDetails"]).map((d) => {
          const m = o(d);
          return {
            type: s(m["type"]) ?? "",
            direction: s(m["direction"]) ?? "",
            code: s(m["code"]) ?? "",
            companyName: s(m["companyName"]),
          };
        }),
        extrasAmount: n(o(r["price"])["extrasAmount"]),
      };
    }),
  };
}

export function normaliseBookingList(raw: unknown): { reference: string; status: string; creationDate: string | null; holder: string; clientReference: string | null }[] {
  return a(o(raw)["bookings"]).map((x) => {
    const b = o(x);
    const h = o(b["holder"]);
    return {
      reference: s(b["reference"]) ?? "",
      status: s(b["status"]) ?? "",
      creationDate: s(b["creationDate"]),
      holder: `${s(h["name"]) ?? ""} ${s(h["surname"]) ?? ""}`.trim(),
      clientReference: s(b["clientReference"]),
    };
  });
}

// --------------------------------------------------------------- voucher

export interface TransferVoucherLeg {
  serviceName: string;
  direction: string;
  transferType: string;
  vehicle: string;
  category: string;
  from: string;
  to: string;
  serviceDate: string | null;
  pickupTime: string | null;
  pickupDescription: string | null;
  pickupAddress: string | null;
  checkPickup: TransferCheckPickup | null;
  paxDistribution: { adults: number; children: number; infants: number };
  details: TransferDetailInfo[];
  transport: string | null;
  extras: TransferExtra[];
  remarks: string[];
  cancellationPolicies: TransferCancellationPolicy[];
}

export interface TransferVoucher {
  worldwayReference: string;
  supplierReference: string;
  /** Mandatory HBX voucher wording (checklist 4.1). */
  payableStatement: string;
  status: string;
  confirmationDate: string | null;
  leadPassenger: string;
  holderEmail: string;
  holderPhone: string;
  totalAmount: number;
  currency: string;
  legs: TransferVoucherLeg[];
  clientRemark: string | null;
  issuedAt: string;
}

function paxDistribution(paxes: { type: string; age: number | null }[]) {
  const d = { adults: 0, children: 0, infants: 0 };
  for (const p of paxes) {
    if (p.type === "ADULT") d.adults += 1;
    else if (p.type === "CHILD") d.children += 1;
    else if (p.type === "INFANT") d.infants += 1;
  }
  return d;
}

/** Builds the Worldway transfer voucher. Only confirmed bookings get one. */
export function buildTransferVoucher(
  booking: TransferBookingRecord,
  worldwayReference: string,
  issuedAt = new Date().toISOString(),
): TransferVoucher | null {
  if (booking.status !== "CONFIRMED") return null;
  const supplier = booking.supplierName ?? "our local transfer partner";
  return {
    worldwayReference,
    supplierReference: booking.reference,
    payableStatement: `Bookable and payable by ${supplier}${booking.supplierVat ? ` (VAT ${booking.supplierVat})` : ""}. Reference: ${booking.reference}.`,
    status: booking.status,
    confirmationDate: booking.creationDate,
    leadPassenger: `${booking.holder.name} ${booking.holder.surname}`.trim(),
    holderEmail: booking.holder.email,
    holderPhone: booking.holder.phone,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    clientRemark: booking.remark || null,
    issuedAt,
    legs: booking.transfers.map((t) => {
      const addr = [t.pickup.address, t.pickup.zip, t.pickup.town].filter(Boolean).join(", ");
      const tr = t.transferDetails[0];
      return {
        serviceName: `${t.transferType === "PRIVATE" ? "Private" : t.transferType === "SHARED" ? "Shared" : t.transferType} ${t.vehicle.name} ${t.category.name} transfer — ${t.pickup.fromName ?? ""} to ${t.pickup.toName ?? ""}`.replace(/\s+/g, " ").trim(),
        direction: t.direction,
        transferType: t.transferType,
        vehicle: t.vehicle.name,
        category: t.category.name,
        from: t.pickup.fromName ?? t.pickup.fromCode ?? "",
        to: t.pickup.toName ?? t.pickup.toCode ?? "",
        serviceDate: t.pickup.date,
        pickupTime: t.pickup.time,
        pickupDescription: t.pickup.description,
        pickupAddress: addr || null,
        checkPickup: t.pickup.checkPickup,
        paxDistribution: paxDistribution(t.paxes),
        details: t.details,
        transport: tr ? `${tr.type} ${tr.code}${tr.companyName ? ` (${tr.companyName})` : ""}` : null,
        extras: t.extras,
        remarks: t.remarks.map((r) => r.description),
        cancellationPolicies: t.cancellationPolicies,
      };
    }),
  };
}

/** Map a supplier booking status onto the Worldway booking status vocabulary. */
export function worldwayStatus(supplierStatus: string): string {
  if (supplierStatus === "CONFIRMED") return "confirmed";
  if (supplierStatus === "CANCELLED") return "cancelled";
  return "pending";
}
