// TripJack TripSafe API v5.1 — server-only service.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { tripjackCall } from "./client.server";
import {
  TRIPJACK_INSURANCE_PRODUCT_TYPE,
  TRIPJACK_INSURANCE_SUPPLIER,
} from "./cabs-contract";
import {
  mapInsuranceStatus,
  validateTripsafeSearch,
  type TripsafeAmendmentRequest,
  type TripsafeBookResponse,
  type TripsafePlan,
  type TripsafeReviewRequest,
  type TripsafeReviewResponse,
  type TripsafeSearchRequest,
  type TripsafeSearchResponse,
} from "./tripsafe-contract";
import type { ServiceResult } from "./cabs.server";

type Client = SupabaseClient<Database>;
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const json = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? {})) as Json;

function fail<T>(message: string, correlationId?: string): ServiceResult<T> {
  return { ok: false, message, correlationId };
}

export type TripsafePlanSummary = {
  pid: string;
  iid: string;
  name: string;
  insurer?: string;
  totalFare?: number;
  currency: string;
  sumInsured?: string;
  benefits: Array<{ name: string; value: string }>;
  raw: TripsafePlan;
};

function flattenPlans(res: TripsafeSearchResponse): TripsafePlanSummary[] {
  const out: TripsafePlanSummary[] = [];
  for (const group of res.isr?.iinfo?.pli ?? []) {
    for (const p of group.pi ?? []) {
      if (!p.pid) continue;
      const fare =
        typeof p.tf === "number"
          ? p.tf
          : typeof (p as Record<string, unknown>).totalFare === "number"
            ? ((p as Record<string, unknown>).totalFare as number)
            : undefined;
      out.push({
        pid: p.pid,
        iid: p.iid ?? group.plid ?? "",
        name: p.pn ?? p.tpn ?? p.pid,
        insurer: p.inn,
        totalFare: fare,
        currency: p.cur ?? "INR",
        sumInsured: p.sumInsured != null ? String(p.sumInsured) : undefined,
        benefits: (p.benefits ?? []).map((b) => ({ name: b.bn ?? "", value: b.bv ?? "" })),
        raw: p,
      });
    }
  }
  return out;
}

/** POST /insurance/v1/searchquery-list (REGULAR / STUDENT / AMT / embedded). */
export async function searchTripsafe(
  req: TripsafeSearchRequest,
): Promise<ServiceResult<{ searchId?: string; plans: TripsafePlanSummary[]; raw: TripsafeSearchResponse }>> {
  const invalid = validateTripsafeSearch(req);
  if (invalid) return fail(invalid);
  const r = await tripjackCall<TripsafeSearchResponse>("tripsafe", "search", req);
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const raw = r.data ?? {};
  return {
    ok: true,
    data: { searchId: raw.searchId ?? raw.isq?.searchId, plans: flattenPlans(raw), raw },
    correlationId: r.correlationId,
  };
}

/** POST /insurance/v1/review — returns the TripJack bookingId used by Book. */
export async function reviewTripsafe(
  req: TripsafeReviewRequest,
): Promise<ServiceResult<{ bookingId: string; totalFare?: number; raw: TripsafeReviewResponse }>> {
  const r = await tripjackCall<TripsafeReviewResponse>("tripsafe", "review", req);
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const raw = r.data ?? {};
  if (!raw.bookingId) return fail("Supplier review did not return a booking id.", r.correlationId);
  const fc = raw.totalPriceInfo?.totalFareDetail?.fC;
  return {
    ok: true,
    data: { bookingId: raw.bookingId, totalFare: fc?.TF ?? fc?.NF, raw },
    correlationId: r.correlationId,
  };
}

// ─── Worldway persistence ────────────────────────────────────────────────────

export type InsuranceBookingRecord = {
  id: string;
  reference: string;
  status: string;
  supplierReference?: string;
  supplierStatus: string;
  title: string;
  amount?: number;
  currency: string;
  travelDate?: string;
  createdAt: string;
  updatedAt: string;
};

export function toInsuranceRecord(row: BookingRow): InsuranceBookingRecord {
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
  const { data } = await client.from("bookings").select("*").eq("idempotency_key", key).maybeSingle();
  return data ?? null;
}

async function loadOwned(client: Client, bookingId: string): Promise<BookingRow> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("product_type", TRIPJACK_INSURANCE_PRODUCT_TYPE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found.");
  return data;
}

function reference(): string {
  const n = Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
  return `WWI-${n}`;
}

export type TripsafeBookInput = {
  idempotencyKey: string;
  review: TripsafeReviewRequest;
  planName: string;
};

/**
 * Documented flow: Review → Book. Review is executed server-side immediately
 * before Book so the fare and bookingId are fresh; the book payload uses the
 * exact total fare returned by Review (paymentInfos[].amount).
 */
export async function bookTripsafe(
  client: Client,
  userId: string,
  input: TripsafeBookInput,
): Promise<{ booking: InsuranceBookingRecord; replay: boolean; message: string }> {
  const existing = await findByIdempotency(client, input.idempotencyKey);
  if (existing) return { booking: toInsuranceRecord(existing), replay: true, message: "Existing booking returned." };

  const review = await reviewTripsafe(input.review);
  if (!review.ok) throw new Error(review.message);
  const amount = review.data.totalFare;
  if (amount == null) throw new Error("Supplier review did not return a total fare.");

  const { data: row, error } = await client
    .from("bookings")
    .insert({
      user_id: userId,
      product_type: TRIPJACK_INSURANCE_PRODUCT_TYPE,
      supplier: TRIPJACK_INSURANCE_SUPPLIER,
      reference: reference(),
      title: input.planName,
      status: "pending",
      supplier_status: "reviewed",
      currency: "INR",
      amount,
      balance_due: amount,
      travel_date: input.review.sd,
      idempotency_key: input.idempotencyKey,
      details: json({
        supplierSuite: "tripsafe",
        environment: "uat",
        pid: input.review.pid,
        iid: input.review.iid,
        reviewBookingId: review.data.bookingId,
        coverage: { sd: input.review.sd, ed: input.review.ed, cd: input.review.cd },
        travellers: input.review.iti.map((t) => ({ id: t.id, fn: t.fn, ln: t.ln, age: t.age })),
      }),
    })
    .select("*")
    .single();
  if (error || !row) {
    const replay = await findByIdempotency(client, input.idempotencyKey);
    if (replay) return { booking: toInsuranceRecord(replay), replay: true, message: "Existing booking returned." };
    throw new Error(error?.message ?? "Booking could not be created.");
  }

  const r = await tripjackCall<TripsafeBookResponse>("tripsafe", "book", {
    bookingId: review.data.bookingId,
    paymentInfos: [{ amount }],
  });
  if (!r.ok) {
    await client
      .from("bookings")
      .update({ status: "failed", supplier_status: "failed", details: json({ ...(row.details as object), failure: r.error.message }) })
      .eq("id", row.id);
    await event(client, row.id, "supplier-error", `TripSafe booking failed: ${r.error.message}`, { correlationId: r.correlationId });
    return { booking: toInsuranceRecord(await loadOwned(client, row.id)), replay: false, message: r.error.message };
  }
  const supplier = r.data ?? {};
  const status = mapInsuranceStatus(supplier.status);
  await client
    .from("bookings")
    .update({
      status,
      supplier_reference: supplier.bookingId ?? review.data.bookingId,
      supplier_status: supplier.status ?? "booked",
      amount_paid: status === "confirmed" ? amount : 0,
      balance_due: status === "confirmed" ? 0 : amount,
    })
    .eq("id", row.id);
  await event(client, row.id, "supplier-booked", `Policy booked with TripSafe (${supplier.bookingId ?? review.data.bookingId}).`, {
    correlationId: r.correlationId,
    supplierStatus: supplier.status,
  });
  return {
    booking: toInsuranceRecord(await loadOwned(client, row.id)),
    replay: false,
    message: status === "confirmed" ? "Policy issued." : "Policy request submitted to TripSafe.",
  };
}

/** POST /oms/v1/insurance/booking-details { bookingId } */
export async function syncTripsafeBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: InsuranceBookingRecord; supplier?: Record<string, unknown>; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (!row.supplier_reference) return { booking: toInsuranceRecord(row), message: "No supplier reference yet." };
  const r = await tripjackCall<Record<string, unknown>>("tripsafe", "booking-details", { bookingId: row.supplier_reference });
  if (!r.ok) return { booking: toInsuranceRecord(row), message: r.error.message };
  const order = (r.data?.order ?? {}) as Record<string, unknown>;
  const supplierStatus = typeof order.status === "string" ? order.status : undefined;
  if (supplierStatus) {
    await client
      .from("bookings")
      .update({ status: mapInsuranceStatus(supplierStatus), supplier_status: supplierStatus })
      .eq("id", row.id);
  }
  return { booking: toInsuranceRecord(await loadOwned(client, row.id)), supplier: r.data, message: "Synchronised." };
}

/**
 * Documented two-step cancellation: POST /oms/v1/ins/amendment/raise
 * (type CANCELLATION) → POST /oms/v1/ins/amendment/confirm-insurance-cancellation
 * with the returned amendmentId.
 */
export async function cancelTripsafeBooking(
  client: Client,
  bookingId: string,
  reason: string,
): Promise<{ booking: InsuranceBookingRecord; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (row.status === "cancelled") return { booking: toInsuranceRecord(row), message: "Already cancelled." };
  if (!row.supplier_reference) {
    await client
      .from("bookings")
      .update({ status: "cancelled", supplier_status: "cancelled", cancellation_reason: reason })
      .eq("id", row.id);
    await event(client, row.id, "cancelled", "Policy request cancelled before issuance.");
    return { booking: toInsuranceRecord(await loadOwned(client, row.id)), message: "Cancelled." };
  }

  const raisePayload: TripsafeAmendmentRequest = {
    bookingId: row.supplier_reference,
    type: "CANCELLATION",
    remarks: reason,
  };
  const raise = await tripjackCall<{ amendmentId?: string; status?: string }>("tripsafe", "amend", raisePayload);
  if (!raise.ok) {
    await event(client, row.id, "supplier-error", `TripSafe amendment failed: ${raise.error.message}`, { correlationId: raise.correlationId });
    return { booking: toInsuranceRecord(row), message: raise.error.message };
  }
  const amendmentId = raise.data?.amendmentId;
  if (!amendmentId) {
    return { booking: toInsuranceRecord(row), message: "Supplier did not return an amendment id." };
  }
  const confirm = await tripjackCall<{ status?: string }>("tripsafe", "cancel", {
    bookingId: row.supplier_reference,
    amendmentId,
  });
  if (!confirm.ok) {
    await event(client, row.id, "supplier-error", `TripSafe cancellation confirm failed: ${confirm.error.message}`, { correlationId: confirm.correlationId, amendmentId });
    return { booking: toInsuranceRecord(row), message: confirm.error.message };
  }
  await client
    .from("bookings")
    .update({
      status: "cancelled",
      supplier_status: confirm.data?.status ?? "cancelled",
      cancellation_reason: reason,
      details: json({ ...(row.details as object), cancellation: { amendmentId } }),
    })
    .eq("id", row.id);
  await event(client, row.id, "cancelled", "Policy cancelled with TripSafe.", { amendmentId, correlationId: confirm.correlationId });
  return { booking: toInsuranceRecord(await loadOwned(client, row.id)), message: "Policy cancelled." };
}

export async function listInsuranceBookings(client: Client): Promise<InsuranceBookingRecord[]> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("product_type", TRIPJACK_INSURANCE_PRODUCT_TYPE)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toInsuranceRecord);
}
