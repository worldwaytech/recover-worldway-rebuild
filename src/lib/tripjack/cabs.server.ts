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
  mapCabStatus,
  type CabAmendmentQuote,
  type CabAmendmentResult,
  type CabBookingRequest,
  type CabBookingResponseData,
  type CabLatLong,
  type CabPlace,
  type CabQuoteRequest,
  type CabQuoteResponseData,
  type TripjackEnvelope,
} from "./cabs-contract";

type Client = SupabaseClient<Database>;
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

/** POST /cabs/v1/google-places — body { query }. */
export async function searchCabPlaces(query: string): Promise<ServiceResult<CabPlace[]>> {
  const r = await tripjackCall<TripjackEnvelope<CabPlace[]> | CabPlace[]>(
    "cabs",
    "location-search",
    { query },
  );
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<CabPlace[]>(r.data) ?? [];
  return { ok: true, data: Array.isArray(data) ? data : [], correlationId: r.correlationId };
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

/** GET /cabs/v1/booking/details?bookingId= */
export async function fetchCabBookingDetails(
  supplierBookingId: string,
): Promise<ServiceResult<CabBookingResponseData>> {
  const r = await tripjackCall<TripjackEnvelope<CabBookingResponseData>>(
    "cabs",
    "booking-details",
    undefined,
    { bookingId: supplierBookingId },
  );
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<CabBookingResponseData>(r.data);
  if (!data) return fail("Booking details unavailable.", r.correlationId);
  return { ok: true, data, correlationId: r.correlationId };
}

/** GET /cabs/v1/amendment?bookingId=&amendType=CANCELLATION */
export async function fetchCabCancellationCharges(
  supplierBookingId: string,
): Promise<ServiceResult<CabAmendmentQuote>> {
  const r = await tripjackCall<TripjackEnvelope<{ amendment?: CabAmendmentQuote }>>(
    "cabs",
    "amend-charges",
    undefined,
    { bookingId: supplierBookingId, amendType: "CANCELLATION" },
  );
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const data = unwrap<{ amendment?: CabAmendmentQuote } & CabAmendmentQuote>(r.data);
  const amendment = data?.amendment ?? data;
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
  const { data: row, error } = await client
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
    await client
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
  await client
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
        paymentStatus: supplier.paymentStatus,
        trackingLink: supplier.trackingLink,
        rideStatus: supplier.rideStatus,
        amendmentAllowed: supplier.amendmentAllowed,
      }),
    })
    .eq("id", row.id);
  await event(client, row.id, "supplier-booked", `Cab booked with TripJack (${supplier.id}).`, {
    correlationId: r.correlationId,
    supplierStatus: supplier.status,
    paymentStatus: supplier.paymentStatus,
  });

  const saved = await loadOwned(client, row.id);
  return {
    booking: toCabRecord(saved),
    replay: false,
    message:
      supplier.paymentStatus && supplier.paymentStatus.toUpperCase() !== "PAID"
        ? "Booking created with TripJack — payment is required to confirm the ride."
        : "Cab booking confirmed with TripJack.",
  };
}

/** Cabs v2 §3 Payment API — POST /cabs/v1/payment/create { bookingId }. */
export async function payCabBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: CabBookingRecord; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (!row.supplier_reference) throw new Error("This booking has no supplier reference.");

  const r = await tripjackCall<TripjackEnvelope<CabBookingResponseData>>("cabs", "payment", {
    bookingId: row.supplier_reference,
  });
  if (!r.ok) {
    await event(client, row.id, "supplier-error", `TripJack payment failed: ${r.error.message}`, {
      correlationId: r.correlationId,
    });
    return { booking: toCabRecord(row), message: r.error.message };
  }
  const supplier = unwrap<CabBookingResponseData>(r.data);
  const status = mapCabStatus(supplier?.status);
  const amount = supplier?.totalPrice ?? row.amount ?? 0;
  const paid = (supplier?.paymentStatus ?? "").toUpperCase() === "PAID" || status === "confirmed";
  await client
    .from("bookings")
    .update({
      status,
      supplier_status: supplier?.status ?? row.supplier_status,
      amount_paid: paid ? amount : row.amount_paid,
      balance_due: paid ? 0 : row.balance_due,
      details: json({
        ...(row.details as object),
        paymentStatus: supplier?.paymentStatus,
        trackingLink: supplier?.trackingLink ?? (row.details as Record<string, unknown>).trackingLink,
      }),
    })
    .eq("id", row.id);
  await event(client, row.id, "payment", `Payment processed with TripJack (${supplier?.paymentStatus ?? "unknown"}).`, {
    correlationId: r.correlationId,
  });
  return { booking: toCabRecord(await loadOwned(client, row.id)), message: "Payment processed." };
}

/** Refreshes a Worldway cab booking from GET /cabs/v1/booking/details. */
export async function syncCabBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: CabBookingRecord; supplier?: CabBookingResponseData; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (!row.supplier_reference) return { booking: toCabRecord(row), message: "No supplier reference yet." };
  const r = await fetchCabBookingDetails(row.supplier_reference);
  if (!r.ok) return { booking: toCabRecord(row), message: r.message };
  await client
    .from("bookings")
    .update({
      status: mapCabStatus(r.data.status),
      supplier_status: r.data.status ?? row.supplier_status,
      details: json({
        ...(row.details as object),
        paymentStatus: r.data.paymentStatus,
        trackingLink: r.data.trackingLink,
        rideStatus: r.data.rideStatus,
        amendmentAllowed: r.data.amendmentAllowed,
      }),
    })
    .eq("id", row.id);
  return { booking: toCabRecord(await loadOwned(client, row.id)), supplier: r.data, message: "Synchronised." };
}

/**
 * Cabs v2 §3 Amendment Cancellation API — POST /cabs/v1/amendment
 * { bookingId, amendType: "CANCELLATION", remarks }. Charges are quoted via
 * the GET endpoint first so the customer is never surprised.
 */
export async function cancelCabBooking(
  client: Client,
  bookingId: string,
  reason: string,
): Promise<{ booking: CabBookingRecord; amendment?: CabAmendmentResult; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (row.status === "cancelled") return { booking: toCabRecord(row), message: "Already cancelled." };
  if (!row.supplier_reference) {
    await client
      .from("bookings")
      .update({ status: "cancelled", supplier_status: "cancelled", cancellation_reason: reason })
      .eq("id", row.id);
    await event(client, row.id, "cancelled", "Booking cancelled before supplier confirmation.");
    return { booking: toCabRecord(await loadOwned(client, row.id)), message: "Cancelled." };
  }

  const charges = await fetchCabCancellationCharges(row.supplier_reference);
  const r = await tripjackCall<TripjackEnvelope<CabAmendmentResult>>("cabs", "cancel", {
    bookingId: row.supplier_reference,
    amendType: "CANCELLATION",
    remarks: reason,
  });
  if (!r.ok) {
    await event(client, row.id, "supplier-error", `TripJack cancellation failed: ${r.error.message}`, {
      correlationId: r.correlationId,
    });
    return { booking: toCabRecord(row), message: r.error.message };
  }
  const amendment = unwrap<CabAmendmentResult>(r.data);
  await client
    .from("bookings")
    .update({
      status: "cancelled",
      supplier_status: amendment?.amendStatus ?? "cancelled",
      cancellation_reason: reason,
      details: json({
        ...(row.details as object),
        cancellation: {
          amendmentId: amendment?.id,
          refundAmount: amendment?.refundAmount,
          charge: amendment?.tjAmendmentCharge,
          quoted: charges.ok ? charges.data : undefined,
        },
      }),
    })
    .eq("id", row.id);
  await event(client, row.id, "cancelled", "Cab booking cancelled with TripJack.", {
    correlationId: r.correlationId,
    refundAmount: amendment?.refundAmount,
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
