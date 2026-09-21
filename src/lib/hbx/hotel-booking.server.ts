// HBX Hotel Booking API — availability → CheckRate → booking → detail → cancel.
//
// Extends the existing signed client (src/lib/hbx/client.server.ts); it adds no
// second transport and no second credential path. Every call reuses the
// `hotels` suite credentials, rate limit, retry and logging policy.
//
// Safety: `runHotelCertification()` refuses to run unless HBX_ENVIRONMENT is
// `test`, so the certification cycle can never transact against live inventory.
import { HBX_SUITE_CONFIG } from "./config";
import { hbxCall, hbxEnvironment } from "./client.server";
import type { HbxResult } from "./types";

const CFG = HBX_SUITE_CONFIG.hotels;

export interface HotelAvailabilityQuery {
  checkIn: string;
  checkOut: string;
  /** HBX destination code (e.g. PMI) — or an explicit hotel code list. */
  destinationCode?: string;
  hotelCodes?: (string | number)[];
  rooms?: number;
  adults?: number;
  children?: number;
  currency?: string;
}

export interface HotelRateOption {
  hotelCode: number | string;
  hotelName: string;
  categoryName?: string;
  destinationName?: string;
  roomCode: string;
  roomName?: string;
  boardName?: string;
  rateKey: string;
  rateClass?: string;
  rateType?: string;
  net: string;
  currency?: string;
  /** Refundable when HBX reports no penalty window, or a 0-cost first window. */
  refundable: boolean;
  cancellationPolicies: { amount?: string; from?: string }[];
}

type RawRate = {
  rateKey?: string;
  rateClass?: string;
  rateType?: string;
  net?: string;
  boardName?: string;
  cancellationPolicies?: { amount?: string; from?: string }[];
};
type RawRoom = { code?: string; name?: string; rates?: RawRate[] };
type RawHotel = {
  code?: number | string;
  name?: string;
  categoryName?: string;
  destinationName?: string;
  currency?: string;
  rooms?: RawRoom[];
};

function flattenRates(payload: unknown): HotelRateOption[] {
  const hotels = (payload as { hotels?: { hotels?: RawHotel[] } } | null)?.hotels?.hotels ?? [];
  const out: HotelRateOption[] = [];
  for (const hotel of hotels) {
    for (const room of hotel.rooms ?? []) {
      for (const rate of room.rates ?? []) {
        if (!rate.rateKey) continue;
        const policies = rate.cancellationPolicies ?? [];
        out.push({
          hotelCode: hotel.code ?? "",
          hotelName: (hotel.name ?? "").trim(),
          categoryName: hotel.categoryName,
          destinationName: hotel.destinationName,
          roomCode: room.code ?? "",
          roomName: room.name?.trim(),
          boardName: rate.boardName,
          rateKey: rate.rateKey,
          rateClass: rate.rateClass,
          rateType: rate.rateType,
          net: rate.net ?? "0",
          currency: hotel.currency,
          refundable:
            rate.rateClass !== "NRF" &&
            (policies.length === 0 || Number(policies[0]?.amount ?? 0) === 0 || !!policies[0]?.from),
          cancellationPolicies: policies,
        });
      }
    }
  }
  return out;
}

/** Live availability search (Hotel Booking API `/hotels`). */
export async function searchHotelAvailability(
  query: HotelAvailabilityQuery,
): Promise<HbxResult<{ options: HotelRateOption[]; hotelCount: number }>> {
  const body: Record<string, unknown> = {
    stay: { checkIn: query.checkIn, checkOut: query.checkOut },
    occupancies: [
      {
        rooms: Math.max(1, query.rooms ?? 1),
        adults: Math.max(1, query.adults ?? 2),
        children: Math.max(0, query.children ?? 0),
      },
    ],
  };
  if (query.hotelCodes?.length) body["hotels"] = { hotel: query.hotelCodes.map(Number) };
  else body["destination"] = { code: query.destinationCode };
  if (query.currency) body["currency"] = query.currency;

  const res = await hbxCall<unknown>({
    suite: "hotels",
    api: "booking",
    path: CFG.bookingEndpoints["availability"]!,
    method: "POST",
    body,
    cacheTtlSeconds: 0,
    operation: "hotels.booking.availability",
  });
  if (!res.ok) return res as HbxResult<{ options: HotelRateOption[]; hotelCount: number }>;
  const options = flattenRates(res.data);
  const hotelCount =
    (res.data as { hotels?: { hotels?: unknown[] } } | null)?.hotels?.hotels?.length ?? 0;
  return { ...res, data: { options, hotelCount } };
}

/** Re-price and re-validate a rate key before any booking (HBX CheckRate). */
export async function checkHotelRate(
  rateKey: string,
): Promise<HbxResult<{ rateKey: string; net: string; currency?: string; cancellationPolicies: { amount?: string; from?: string }[]; rateComments?: string }>> {
  const res = await hbxCall<unknown>({
    suite: "hotels",
    api: "booking",
    path: CFG.bookingEndpoints["checkRate"]!,
    method: "POST",
    body: { rooms: [{ rateKey }] },
    cacheTtlSeconds: 0,
    operation: "hotels.booking.checkRate",
  });
  if (!res.ok) return res as never;
  const rate = (res.data as { hotel?: { currency?: string; rooms?: RawRoom[] } } | null)?.hotel
    ?.rooms?.[0]?.rates?.[0];
  if (!rate?.rateKey) {
    return {
      ...res,
      ok: false,
      data: undefined,
      error: {
        code: "invalid-response",
        message: "HBX did not return a confirmed rate for this room.",
        status: 502,
        retryable: false,
      },
    } as never;
  }
  return {
    ...res,
    data: {
      rateKey: rate.rateKey,
      net: rate.net ?? "0",
      currency: (res.data as { hotel?: { currency?: string } }).hotel?.currency,
      cancellationPolicies: rate.cancellationPolicies ?? [],
      rateComments: (rate as { rateComments?: string }).rateComments,
    },
  };
}

export interface HotelBookingRequest {
  /** Rate key returned by CheckRate — never a raw availability key. */
  rateKey: string;
  holder: { name: string; surname: string };
  /** HBX enforces 1–20 characters on clientReference. */
  clientReference: string;
  paxes: { roomId: number; type: "AD" | "CH"; name: string; surname: string; age?: number }[];
  remark?: string;
  /** Accepted price drift versus CheckRate, supplier currency. */
  tolerance?: number;
}

export interface HotelBookingSummary {
  reference: string;
  clientReference?: string;
  status?: string;
  totalNet?: number;
  currency?: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  cancellationReference?: string;
}

function summariseBooking(payload: unknown): HotelBookingSummary | null {
  const b = (payload as { booking?: Record<string, unknown> } | null)?.booking;
  if (!b || typeof b["reference"] !== "string") return null;
  const hotel = b["hotel"] as { name?: string; checkIn?: string; checkOut?: string } | undefined;
  return {
    reference: b["reference"],
    clientReference: b["clientReference"] as string | undefined,
    status: b["status"] as string | undefined,
    totalNet: Number(b["totalNet"] ?? 0),
    currency: b["currency"] as string | undefined,
    hotelName: hotel?.name?.trim(),
    checkIn: hotel?.checkIn,
    checkOut: hotel?.checkOut,
    cancellationReference: b["cancellationReference"] as string | undefined,
  };
}

export async function createHotelBooking(
  req: HotelBookingRequest,
): Promise<HbxResult<HotelBookingSummary | null>> {
  if (req.clientReference.length < 1 || req.clientReference.length > 20) {
    throw new Error("clientReference must be between 1 and 20 characters (HBX contract).");
  }
  const res = await hbxCall<unknown>({
    suite: "hotels",
    api: "booking",
    path: CFG.bookingEndpoints["booking"]!,
    method: "POST",
    body: {
      holder: req.holder,
      rooms: [{ rateKey: req.rateKey, paxes: req.paxes }],
      clientReference: req.clientReference,
      remark: req.remark,
      tolerance: req.tolerance ?? 2,
    },
    cacheTtlSeconds: 0,
    operation: "hotels.booking.create",
  });
  if (!res.ok) return res as HbxResult<HotelBookingSummary | null>;
  return { ...res, data: summariseBooking(res.data) };
}

export async function getHotelBooking(
  reference: string,
): Promise<HbxResult<HotelBookingSummary | null>> {
  const res = await hbxCall<unknown>({
    suite: "hotels",
    api: "booking",
    path: `${CFG.bookingEndpoints["booking"]!}/${encodeURIComponent(reference)}`,
    cacheTtlSeconds: 0,
    operation: "hotels.booking.detail",
  });
  if (!res.ok) return res as HbxResult<HotelBookingSummary | null>;
  return { ...res, data: summariseBooking(res.data) };
}

export async function cancelHotelBooking(
  reference: string,
  simulate = false,
): Promise<HbxResult<HotelBookingSummary | null>> {
  const res = await hbxCall<unknown>({
    suite: "hotels",
    api: "booking",
    path: `${CFG.bookingEndpoints["booking"]!}/${encodeURIComponent(reference)}`,
    method: "DELETE",
    query: { cancellationFlag: simulate ? "SIMULATION" : "CANCELLATION" },
    cacheTtlSeconds: 0,
    operation: "hotels.booking.cancel",
  });
  if (!res.ok) return res as HbxResult<HotelBookingSummary | null>;
  return { ...res, data: summariseBooking(res.data) };
}

// ------------------------------------------------------------ certification

export interface CertificationStep {
  step: string;
  ok: boolean;
  status: number;
  durationMs: number;
  detail: string;
}

export interface CertificationReport {
  environment: string;
  startedAt: string;
  passed: boolean;
  bookingReference: string | null;
  finalBookingStatus: string | null;
  steps: CertificationStep[];
}

/**
 * Runs the full HBX hotel certification cycle against the TEST environment
 * only: status → availability → CheckRate → booking → detail → cancellation.
 * The booking it creates is a test-environment reservation which the same run
 * cancels; it never touches live inventory or customer records.
 */
export async function runHotelCertification(params: {
  destinationCode?: string;
  checkIn?: string;
  checkOut?: string;
}): Promise<CertificationReport> {
  const environment = hbxEnvironment();
  const steps: CertificationStep[] = [];
  const report: CertificationReport = {
    environment,
    startedAt: new Date().toISOString(),
    passed: false,
    bookingReference: null,
    finalBookingStatus: null,
    steps,
  };
  if (environment !== "test") {
    steps.push({
      step: "guard",
      ok: false,
      status: 0,
      durationMs: 0,
      detail: "Refused: certification only runs when HBX_ENVIRONMENT is 'test'.",
    });
    return report;
  }

  const day = 24 * 60 * 60 * 1000;
  const checkIn = params.checkIn ?? new Date(Date.now() + 50 * day).toISOString().slice(0, 10);
  const checkOut = params.checkOut ?? new Date(Date.now() + 52 * day).toISOString().slice(0, 10);
  const destinationCode = params.destinationCode ?? "PMI";

  const { probeHotelBookingApi } = await import("./hotels.server");
  const status = await probeHotelBookingApi();
  steps.push({
    step: "connectivity (/status)",
    ok: status.ok,
    status: status.status,
    durationMs: status.meta.durationMs,
    detail: status.ok ? "Booking API reachable and authenticated." : status.error?.message ?? "Unreachable.",
  });
  if (!status.ok) return report;

  const avail = await searchHotelAvailability({ destinationCode, checkIn, checkOut, rooms: 1, adults: 2 });
  steps.push({
    step: "availability",
    ok: avail.ok,
    status: avail.status,
    durationMs: avail.meta.durationMs,
    detail: avail.ok
      ? `${avail.data?.hotelCount ?? 0} hotels, ${avail.data?.options.length ?? 0} bookable rates for ${destinationCode} ${checkIn}→${checkOut}.`
      : avail.error?.message ?? "Availability failed.",
  });
  const option =
    avail.data?.options.find((o) => o.rateType === "BOOKABLE" && o.refundable) ??
    avail.data?.options.find((o) => o.rateType === "BOOKABLE");
  if (!avail.ok || !option) {
    steps.push({
      step: "rate selection",
      ok: false,
      status: avail.status,
      durationMs: 0,
      detail: "No bookable rate returned for the certification search.",
    });
    return report;
  }
  steps.push({
    step: "rate selection",
    ok: true,
    status: 200,
    durationMs: 0,
    detail: `${option.hotelName} · ${option.roomCode} · ${option.rateClass} · net ${option.net} · ${option.refundable ? "refundable" : "non-refundable"}.`,
  });

  const rate = await checkHotelRate(option.rateKey);
  steps.push({
    step: "checkRate",
    ok: rate.ok,
    status: rate.status,
    durationMs: rate.meta.durationMs,
    detail: rate.ok
      ? `Re-priced at ${rate.data?.net} ${rate.data?.currency ?? ""} with ${rate.data?.cancellationPolicies.length ?? 0} cancellation window(s).`
      : rate.error?.message ?? "CheckRate failed.",
  });
  if (!rate.ok || !rate.data) return report;

  const clientReference = `WWLCERT${String(Date.now()).slice(-8)}`;
  const booking = await createHotelBooking({
    rateKey: rate.data.rateKey,
    holder: { name: "HBXTEST", surname: "WORLDWAY" },
    clientReference,
    paxes: [
      { roomId: 1, type: "AD", name: "HBXTEST", surname: "WORLDWAY" },
      { roomId: 1, type: "AD", name: "HBXTEST", surname: "TWO" },
    ],
    remark: "Integration certification test - do not service",
    tolerance: 2,
  });
  steps.push({
    step: "test booking",
    ok: booking.ok && !!booking.data,
    status: booking.status,
    durationMs: booking.meta.durationMs,
    detail: booking.data
      ? `Reference ${booking.data.reference} · ${booking.data.status} · net ${booking.data.totalNet} ${booking.data.currency ?? ""} · client ref ${booking.data.clientReference}.`
      : booking.error?.message ?? "Booking failed.",
  });
  if (!booking.ok || !booking.data) return report;
  report.bookingReference = booking.data.reference;

  const detail = await getHotelBooking(booking.data.reference);
  steps.push({
    step: "booking detail",
    ok: detail.ok && detail.data?.status === "CONFIRMED",
    status: detail.status,
    durationMs: detail.meta.durationMs,
    detail: detail.data
      ? `Retrieved ${detail.data.reference} in state ${detail.data.status}.`
      : detail.error?.message ?? "Retrieve failed.",
  });

  const cancelled = await cancelHotelBooking(booking.data.reference);
  steps.push({
    step: "cancellation",
    ok: cancelled.ok && cancelled.data?.status === "CANCELLED",
    status: cancelled.status,
    durationMs: cancelled.meta.durationMs,
    detail: cancelled.data
      ? `Cancelled ${cancelled.data.reference} · state ${cancelled.data.status}.`
      : cancelled.error?.message ?? "Cancellation failed.",
  });

  const verify = await getHotelBooking(booking.data.reference);
  report.finalBookingStatus = verify.data?.status ?? null;
  steps.push({
    step: "post-cancellation verification",
    ok: verify.ok && verify.data?.status === "CANCELLED",
    status: verify.status,
    durationMs: verify.meta.durationMs,
    detail: verify.data
      ? `Supplier confirms final state ${verify.data.status}.`
      : verify.error?.message ?? "Verification failed.",
  });

  report.passed = steps.every((s) => s.ok);
  return report;
}
