// TripJack Cabs API v2 — server-only service.
//
// Every supplier call goes through tripjackCall (redacted logging, correlation
// IDs, UAT-only host). Worldway persistence uses the caller's RLS-scoped client
// so tenant isolation is enforced by the database.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { tripjackCall } from "./client.server";
import {
  TRIPJACK_CAB_PRODUCT_TYPE,
  TRIPJACK_CAB_SUPPLIER,
  buildCabCancellationBody,
  buildCabPaymentBody,
  mapCabStatus,
  parseCabBookingDetails,
  type CabAmendmentQuote,
  type CabAmendmentResult,
  type CabBookingDetailsSummary,
  type CabBookingRequest,
  type CabBookingResponseData,
  type CabLatLong,
  type CabPlace,
  type CabQuoteRequest,
  type CabQuoteResponseData,
  type TripjackEnvelope,
} from "./cabs-contract";

type Client = SupabaseClient<Database>;

// Customers have no direct write access to bookings (RLS hardening, 18 Sep);
// rows are written server-side after ownership has been verified.
async function writer(): Promise<Client> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Client;
}
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const json = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? {})) as Json;

function unwrap<T>(env: TripjackEnvelope<T> | T | undefined): T | undefined {
  if (env && typeof env === "object" && "data" in (env as object)) {
    return (env as TripjackEnvelope<T>).data;
  }
  return env as T | undefined;
}

export type ServiceResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; message: string; correlationId?: string };

function fail<T>(message: string, correlationId?: string): ServiceResult<T> {
  return { ok: false, message, correlationId };
}

// ─── Read operations (Cabs v2 §3) ────────────────────────────────────────────

/** POST /cabs/v1/google-places — body { input }; response data.places[]. */
export async function searchCabPlaces(input: string): Promise<ServiceResult<CabPlace[]>> {
  const r = await tripjackCall<TripjackEnvelope<{ places?: CabPlace[] }>>(
    "cabs",
    "location-search",
    { input },
  );
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<{ places?: CabPlace[] }>(r.data);
  const places = Array.isArray(data?.places) ? data.places : [];
  return { ok: true, data: places, correlationId: r.correlationId };
}

/** POST /cabs/v1/get-lat-long — body { placeId }. */
export async function resolveCabPlace(placeId: string): Promise<ServiceResult<CabLatLong>> {
  const r = await tripjackCall<TripjackEnvelope<CabLatLong>>("cabs", "location-latlong", {
    placeId,
  });
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<CabLatLong>(r.data);
  if (!data?.location) return fail("Location could not be resolved.", r.correlationId);
  return { ok: true, data, correlationId: r.correlationId };
}

/** POST /cabs/v2/quotes — airport transfer / round trip / outstation / local. */
export async function quoteCabs(
  req: CabQuoteRequest,
): Promise<ServiceResult<CabQuoteResponseData>> {
  if (req.tripType === "roundtrip" && !req.returnDate) {
    return fail("Return date and time are required for a round trip.");
  }
  const r = await tripjackCall<TripjackEnvelope<CabQuoteResponseData>>("cabs", "quote", req);
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<CabQuoteResponseData>(r.data);
  if (!data) return fail("No quotes were returned for this journey.", r.correlationId);
  return { ok: true, data, correlationId: r.correlationId };
}

/** GET /cabs/v1/booking/details?bookingIds= — response data[] of { order, … }. */
export async function fetchCabBookingDetails(
  supplierBookingId: string,
): Promise<ServiceResult<CabBookingDetailsSummary>> {
  const r = await tripjackCall<TripjackEnvelope<unknown>>(
    "cabs",
    "booking-details",
    undefined,
    { bookingIds: supplierBookingId },
  );
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const summary = parseCabBookingDetails(unwrap<unknown>(r.data), supplierBookingId);
  if (!summary) return fail("Booking details unavailable for this booking id.", r.correlationId);
  return { ok: true, data: summary, correlationId: r.correlationId };
}

/** GET /cabs/v1/amendment?bookingId=&type=CANCELLATION — response data.amendment. */
export async function fetchCabCancellationCharges(
  supplierBookingId: string,
): Promise<ServiceResult<CabAmendmentQuote>> {
  const r = await tripjackCall<TripjackEnvelope<{ amendment?: CabAmendmentQuote }>>(
    "cabs",
    "amend-charges",
    undefined,
    { bookingId: supplierBookingId, type: "CANCELLATION" },
  );
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<{ amendment?: CabAmendmentQuote }>(r.data);
  const amendment = data?.amendment;
  if (!amendment) return fail("Cancellation charges unavailable.", r.correlationId);
  return { ok: true, data: amendment, correlationId: r.correlationId };
}

// ─── Worldway persistence ────────────────────────────────────────────────────

export type CabBookingRecord = {
  id: string;
  reference: string;
  status: string;
  supplierReference?: string;
  supplierStatus: string;
  title: string;
  amount?: number;
  currency: string;
  travelDate?: string;
  trackingLink?: string;
  paymentStatus?: string;
  createdAt: string;
  updatedAt: string;
};

export function toCabRecord(row: BookingRow): CabBookingRecord {
  const d = (row.details ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    supplierReference: row.supplier_reference ?? undefined,
    supplierStatus: row.supplier_status,
    title: row.title,
    amount: row.amount ?? undefined,
    currency: row.currency,
    travelDate: row.travel_date ?? undefined,
    trackingLink: d.trackingLink ? String(d.trackingLink) : undefined,
    paymentStatus: d.paymentStatus ? String(d.paymentStatus) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function event(
  client: Client,
  bookingId: string,
  eventType: string,
  summary: string,
  detail: Record<string, unknown> = {},
) {
  await client
    .from("booking_events")
    .insert({ booking_id: bookingId, event_type: eventType, summary, detail: json(detail) });
}

async function findByIdempotency(client: Client, key: string): Promise<BookingRow | null> {
  const { data } = await client
    .from("bookings")
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  return data ?? null;
}

async function loadOwned(client: Client, bookingId: string): Promise<BookingRow> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("product_type", TRIPJACK_CAB_PRODUCT_TYPE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found.");
  return data;
}

function reference(): string {
  const n = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0");
  return `WWC-${n}`;
}

export type CabBookInput = {
  idempotencyKey: string;
  request: CabBookingRequest;
  title: string;
};

/**
 * Cabs v2 §3 Booking API. The quote is re-validated first (POST /cabs/v2/quotes
 * with the same journey) — the documented flow is Quotes → Booking → Payment.
 * A Worldway booking row is written before the supplier is called so every
 * outcome is auditable; the row is then updated with the supplier response.
 */
export async function bookCab(
  client: Client,
  userId: string,
  input: CabBookInput,
): Promise<{ booking: CabBookingRecord; replay: boolean; message: string }> {
  const existing = await findByIdempotency(client, input.idempotencyKey);
  if (existing) {
    return { booking: toCabRecord(existing), replay: true, message: "Existing booking returned." };
  }

  const gross = Number(input.request.pricingInfo.grossAmount);
  const { data: row, error } = await (await writer())
    .from("bookings")
    .insert({
      user_id: userId,
      product_type: TRIPJACK_CAB_PRODUCT_TYPE,
      supplier: TRIPJACK_CAB_SUPPLIER,
      reference: reference(),
      title: input.title,
      status: "pending",
      supplier_status: "requested",
      currency: "INR",
      amount: Number.isFinite(gross) ? gross : null,
      balance_due: Number.isFinite(gross) ? gross : 0,
      travel_date: input.request.journeyInfo.pickupDateTime?.slice(0, 10) ?? null,
      idempotency_key: input.idempotencyKey,
      details: json({
        supplierSuite: "cabs",
        environment: "uat",
        quoteId: input.request.quotationInfo.quoteId,
        childQuoteId: input.request.quotationInfo.childQuoteId,
        journeyInfo: input.request.journeyInfo,
        routeDetail: input.request.routeDetail,
        passenger: {
          firstName: input.request.passengerDetail.firstName,
          lastName: input.request.passengerDetail.lastName,
        },
      }),
    })
    .select("*")
    .single();
  if (error || !row) {
    const replay = await findByIdempotency(client, input.idempotencyKey);
    if (replay) return { booking: toCabRecord(replay), replay: true, message: "Existing booking returned." };
    throw new Error(error?.message ?? "Booking could not be created.");
  }

  const r = await tripjackCall<TripjackEnvelope<CabBookingResponseData>>(
    "cabs",
    "book",
    input.request,
  );
  const supplier = r.ok ? unwrap<CabBookingResponseData>(r.data) : undefined;

  if (!r.ok || !supplier?.id) {
    const message = r.ok ? "Supplier did not return a booking id." : r.error.message;
    await (await writer())
      .from("bookings")
      .update({ status: "failed", supplier_status: "failed", details: json({ ...(row.details as object), failure: message }) })
      .eq("id", row.id);
    await event(client, row.id, "supplier-error", `TripJack cab booking failed: ${message}`, {
      correlationId: r.correlationId,
    });
    const failed = await loadOwned(client, row.id);
    return { booking: toCabRecord(failed), replay: false, message };
  }

  const status = mapCabStatus(supplier.status);
  await (await writer())
    .from("bookings")
    .update({
      status,
      supplier_reference: supplier.id,
      supplier_status: supplier.status ?? "booked",
      amount: supplier.totalPrice ?? row.amount,
      currency: supplier.currency ?? row.currency,
      details: json({
        ...(row.details as object),
        supplierBookingId: supplier.id,
        // Documented payUserId for the Payment API (booking response `agentId`).
        payUserId: supplier.agentId,
        supplierTotalPrice: supplier.totalPrice,
        paymentStatus: supplier.paymentStatus,
        trackingLink: supplier.trackingLink,
        rideStatus: supplier.rideStatus,
        amendmentAllowed: supplier.amendmentAllowed,
        correlationIds: { book: r.correlationId },
      }),
    })
    .eq("id", row.id);
  await event(client, row.id, "supplier-booked", `Cab booked with TripJack (${supplier.id}).`, {
    correlationId: r.correlationId,
    supplierStatus: supplier.status,
    paymentStatus: supplier.paymentStatus,
  });

  const saved = await loadOwned(client, row.id);
  const paid = status === "confirmed" || (supplier.paymentStatus ?? "").toUpperCase() === "SUCCESS";
  return {
    booking: toCabRecord(saved),
    replay: false,
    message: paid
      ? "Cab booking confirmed with TripJack."
      : "Booking created with TripJack — payment is required to confirm the ride.",
  };
}

/**
 * Cabs v2 §3 Payment API — POST /cabs/v1/payment/create with the documented
 * body { amount, payUserId, paymentMedium:"WALLET", bookingId, opType:"DEBIT",
 * product:"CAB", transactionType:"PAID_FOR_ORDER" }. `amount` and `payUserId`
 * are taken from the supplier's own booking response (never re-derived); the
 * resulting status is then read back from Booking Details rather than assumed.
 */
export async function payCabBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: CabBookingRecord; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (!row.supplier_reference) throw new Error("This booking has no supplier reference.");
  if (row.status === "cancelled") throw new Error("This booking is cancelled.");
  const details = (row.details ?? {}) as Record<string, unknown>;
  if ((String(details.paymentStatus ?? "")).toUpperCase() === "SUCCESS" || row.status === "confirmed") {
    return { booking: toCabRecord(row), message: "This booking is already paid." };
  }
  const payUserId = typeof details.payUserId === "string" ? details.payUserId : undefined;
  const amount =
    typeof details.supplierTotalPrice === "number" ? details.supplierTotalPrice : row.amount ?? undefined;
  if (!payUserId) throw new Error("Supplier booking did not return a payUserId; payment cannot be raised.");
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Supplier booking did not return a payable amount.");
  }

  const body = buildCabPaymentBody({ amount, payUserId, bookingId: row.supplier_reference });
  const r = await tripjackCall<TripjackEnvelope<Record<string, unknown>>>("cabs", "payment", body);
  if (!r.ok) {
    await event(client, row.id, "supplier-error", `TripJack payment failed: ${r.error.message}`, {
      correlationId: r.correlationId,
    });
    return { booking: toCabRecord(row), message: r.error.message };
  }
  const envelope = r.data;
  if (envelope && typeof envelope === "object" && envelope.success === false) {
    const msg = envelope.message ?? "TripJack rejected the payment request.";
    await event(client, row.id, "supplier-error", `TripJack payment rejected: ${msg}`, { correlationId: r.correlationId });
    return { booking: toCabRecord(row), message: msg };
  }
  await event(client, row.id, "payment", "Payment request accepted by TripJack; confirming via booking details.", {
    correlationId: r.correlationId,
    amount,
  });

  // The Payment API response shape is not documented beyond the envelope, so
  // the authoritative status/paymentStatus is read back from Booking Details.
  const synced = await fetchCabBookingDetails(row.supplier_reference);
  if (!synced.ok) {
    await (await writer())
      .from("bookings")
      .update({ details: json({ ...details, correlationIds: { ...(details.correlationIds as object), payment: r.correlationId } }) })
      .eq("id", row.id);
    return {
      booking: toCabRecord(await loadOwned(client, row.id)),
      message: "Payment submitted; supplier status could not be confirmed yet. Use refresh to re-check.",
    };
  }
  const paid = (synced.data.paymentStatus ?? "").toUpperCase() === "SUCCESS" || mapCabStatus(synced.data.status) === "confirmed";
  await (await writer())
    .from("bookings")
    .update({
      status: mapCabStatus(synced.data.status),
      supplier_status: synced.data.status ?? row.supplier_status,
      amount_paid: paid ? amount : row.amount_paid,
      balance_due: paid ? 0 : row.balance_due,
      details: json({
        ...details,
        paymentStatus: synced.data.paymentStatus,
        paymentDate: synced.data.paymentDate,
        trackingLink: synced.data.trackingLink ?? details.trackingLink,
        rideStatus: synced.data.rideStatus,
        correlationIds: { ...(details.correlationIds as object), payment: r.correlationId, paymentSync: synced.correlationId },
      }),
    })
    .eq("id", row.id);
  return {
    booking: toCabRecord(await loadOwned(client, row.id)),
    message: paid ? "Payment confirmed by TripJack." : `Payment status: ${synced.data.paymentStatus ?? "pending"}.`,
  };
}

/** Refreshes a Worldway cab booking from GET /cabs/v1/booking/details?bookingIds=. */
export async function syncCabBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: CabBookingRecord; supplier?: CabBookingDetailsSummary; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (!row.supplier_reference) return { booking: toCabRecord(row), message: "No supplier reference yet." };
  const r = await fetchCabBookingDetails(row.supplier_reference);
  if (!r.ok) return { booking: toCabRecord(row), message: r.message };
  const paid = (r.data.paymentStatus ?? "").toUpperCase() === "SUCCESS";
  await (await writer())
    .from("bookings")
    .update({
      status: mapCabStatus(r.data.status),
      supplier_status: r.data.status ?? row.supplier_status,
      amount_paid: paid ? (r.data.amount ?? row.amount ?? row.amount_paid) : row.amount_paid,
      balance_due: paid ? 0 : row.balance_due,
      details: json({
        ...(row.details as object),
        paymentStatus: r.data.paymentStatus,
        paymentDate: r.data.paymentDate,
        trackingLink: r.data.trackingLink,
        rideStatus: r.data.rideStatus,
        cancellationPolicy: r.data.policies?.cancellationPolicy,
      }),
    })
    .eq("id", row.id);
  return { booking: toCabRecord(await loadOwned(client, row.id)), supplier: r.data, message: "Synchronised." };
}

/**
 * Cabs v2 §3 Amendment Cancellation API — POST /cabs/v1/amendment
 * { bookingId, amendmentType: "CANCELLATION" }. Charges are quoted via the GET
 * endpoint first so the customer is never surprised; the reason is kept on the
 * Worldway record (the supplier body has no remarks field).
 */
export async function cancelCabBooking(
  client: Client,
  bookingId: string,
  reason: string,
): Promise<{ booking: CabBookingRecord; amendment?: CabAmendmentResult; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (row.status === "cancelled") return { booking: toCabRecord(row), message: "Already cancelled." };
  if (!row.supplier_reference) {
    await (await writer())
      .from("bookings")
      .update({ status: "cancelled", supplier_status: "cancelled", cancellation_reason: reason })
      .eq("id", row.id);
    await event(client, row.id, "cancelled", "Booking cancelled before supplier confirmation.");
    return { booking: toCabRecord(await loadOwned(client, row.id)), message: "Cancelled." };
  }

  const charges = await fetchCabCancellationCharges(row.supplier_reference);
  const r = await tripjackCall<TripjackEnvelope<CabAmendmentResult>>(
    "cabs",
    "cancel",
    buildCabCancellationBody(row.supplier_reference),
  );
  if (!r.ok) {
    await event(client, row.id, "supplier-error", `TripJack cancellation failed: ${r.error.message}`, {
      correlationId: r.correlationId,
    });
    return { booking: toCabRecord(row), message: r.error.message };
  }
  const amendment = unwrap<CabAmendmentResult>(r.data);
  const amendStatus = (amendment?.amendStatus ?? "").toUpperCase();
  if (!amendment?.id || (amendStatus && amendStatus !== "SUCCESS")) {
    const msg = `TripJack did not confirm the cancellation (${amendment?.amendStatus ?? "no amendment id"}).`;
    await event(client, row.id, "supplier-error", msg, { correlationId: r.correlationId });
    return { booking: toCabRecord(row), amendment, message: msg };
  }
  await (await writer())
    .from("bookings")
    .update({
      status: "cancelled",
      supplier_status: amendment.amendStatus ?? "cancelled",
      cancellation_reason: reason,
      details: json({
        ...(row.details as object),
        cancellation: {
          amendmentId: amendment.id,
          refundAmount: amendment.refundAmount,
          refundRefId: amendment.refundRefId,
          charge: amendment.tjAmendmentCharge,
          managementFee: amendment.tjManagementFee,
          processedOn: amendment.processedOn,
          quoted: charges.ok ? charges.data : undefined,
          correlationIds: { charges: charges.ok ? charges.correlationId : undefined, cancel: r.correlationId },
        },
      }),
    })
    .eq("id", row.id);
  await event(client, row.id, "cancelled", `Cab booking cancelled with TripJack (${amendment.id}).`, {
    correlationId: r.correlationId,
    refundAmount: amendment.refundAmount,
  });
  return {
    booking: toCabRecord(await loadOwned(client, row.id)),
    amendment,
    message: "Cab booking cancelled.",
  };
}

export async function listCabBookings(client: Client): Promise<CabBookingRecord[]> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("product_type", TRIPJACK_CAB_PRODUCT_TYPE)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toCabRecord);
}
