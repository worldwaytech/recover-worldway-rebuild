// TripJack TripSafe API v5.1 — server-only service.
//
// Documented flow: Search → Review (pli/plid/pi/pid → bid) → Book (bid +
// paymentInfos[WALLET] + pli→pi→iti + deliveryInfo) → Booking Details
// (order.status + iti[].policyId) → Raise CANCELLATION → Confirm
// INSURANCE_CANCELLATION (both with travellerKeys). Nothing is inferred: every
// id, fare and status comes from the supplier response.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { tripjackCall } from "./client.server";
import {
  TRIPJACK_INSURANCE_PRODUCT_TYPE,
  TRIPJACK_INSURANCE_SUPPLIER,
} from "./cabs-contract";
import {
  buildTravellerKeys,
  buildTripsafeBookBody,
  buildTripsafeConfirmBody,
  buildTripsafeRaiseBody,
  buildTripsafeReviewBody,
  extractAmendment,
  extractTripsafePolicies,
  extractTripsafeReview,
  flattenTripsafePlans,
  isTripsafeCancellable,
  mapInsuranceStatus,
  tripsafeBookSucceeded,
  tripsafeCancellationDeadline,
  validateTripsafeSearch,
  validateTripsafeSelection,
  type TripsafeAmendmentResponse,
  type TripsafeBookResponse,
  type TripsafePlanSummary,
  type TripsafePolicyRecord,
  type TripsafeReviewResponse,
  type TripsafeSearchRequest,
  type TripsafeSearchResponse,
  type TripsafeSelection,
} from "./tripsafe-contract";
import type { ServiceResult } from "./cabs.server";

type Client = SupabaseClient<Database>;
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const json = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? {})) as Json;

function fail<T>(message: string, correlationId?: string): ServiceResult<T> {
  return { ok: false, message, correlationId };
}

function supplierErrors(raw: { errors?: Array<{ message?: string; details?: string }> } | undefined): string | null {
  const e = raw?.errors?.[0];
  if (!e) return null;
  return [e.message, e.details].filter(Boolean).join(": ") || "Supplier rejected the request.";
}

/** POST /insurance/v1/searchquery-list (REGULAR / STUDENT / AMT / embedded). */
export async function searchTripsafe(
  req: TripsafeSearchRequest,
): Promise<ServiceResult<{ searchId?: string; plans: TripsafePlanSummary[] }>> {
  const invalid = validateTripsafeSearch(req);
  if (invalid) return fail(invalid);
  const r = await tripjackCall<TripsafeSearchResponse>("tripsafe", "search", req);
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const raw = r.data ?? {};
  const err = supplierErrors(raw);
  if (err) return fail(err, r.correlationId);
  return {
    ok: true,
    data: { searchId: raw.searchId ?? raw.isq?.searchId, plans: flattenTripsafePlans(raw) },
    correlationId: r.correlationId,
  };
}

/** POST /insurance/v1/review { pli:[{ plid, pi:[{ pid }] }] } → bid + total fare. */
export async function reviewTripsafe(
  sel: Pick<TripsafeSelection, "plid" | "pid">,
): Promise<ServiceResult<{ bid: string; totalFare: number }>> {
  const r = await tripjackCall<TripsafeReviewResponse>("tripsafe", "review", buildTripsafeReviewBody(sel));
  if (!r.ok) return fail(r.error.message, r.correlationId);
  const raw = r.data ?? {};
  const err = supplierErrors(raw);
  if (err) return fail(err, r.correlationId);
  const { bid, totalFare } = extractTripsafeReview(raw);
  if (!bid) return fail("Supplier review did not return a booking id (bid).", r.correlationId);
  if (typeof totalFare !== "number") return fail("Supplier review did not return a total fare.", r.correlationId);
  return { ok: true, data: { bid, totalFare }, correlationId: r.correlationId };
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
  policyIds: string[];
  cancellationDeadline?: string;
  createdAt: string;
  updatedAt: string;
};

export function toInsuranceRecord(row: BookingRow): InsuranceBookingRecord {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const policies = Array.isArray(d.policies) ? (d.policies as TripsafePolicyRecord[]) : [];
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
    policyIds: policies.map((p) => p.policyId),
    cancellationDeadline: row.travel_date ? tripsafeCancellationDeadline(row.travel_date).toISOString() : undefined,
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
  selection: TripsafeSelection;
  planName: string;
};

/**
 * Review → Book. Review is executed server-side immediately before Book so the
 * `bid` and fare are fresh; the Book payload uses the exact Review total fare
 * (paymentInfos[].amount) and the documented traveller / delivery blocks.
 */
export async function bookTripsafe(
  client: Client,
  userId: string,
  input: TripsafeBookInput,
): Promise<{ booking: InsuranceBookingRecord; replay: boolean; message: string }> {
  const existing = await findByIdempotency(client, input.idempotencyKey);
  if (existing) return { booking: toInsuranceRecord(existing), replay: true, message: "Existing booking returned." };

  const invalid = validateTripsafeSelection(input.selection);
  if (invalid) throw new Error(invalid);

  const review = await reviewTripsafe(input.selection);
  if (!review.ok) throw new Error(review.message);
  const { bid, totalFare: amount } = review.data;
  const sel = { ...input.selection, iti: input.selection.iti.map((t, i) => ({ ...t, id: t.id ?? i + 1 })) };

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
      travel_date: sel.sd,
      idempotency_key: input.idempotencyKey,
      details: json({
        supplierSuite: "tripsafe",
        environment: "uat",
        plid: sel.plid,
        pid: sel.pid,
        reviewBid: bid,
        coverage: { sd: sel.sd, ed: sel.ed, cd: sel.cd },
        travellers: sel.iti.map((t) => ({ id: t.id, fn: t.fn, ln: t.ln, age: t.age })),
        correlationIds: { review: review.correlationId },
      }),
    })
    .select("*")
    .single();
  if (error || !row) {
    const replay = await findByIdempotency(client, input.idempotencyKey);
    if (replay) return { booking: toInsuranceRecord(replay), replay: true, message: "Existing booking returned." };
    throw new Error(error?.message ?? "Booking could not be created.");
  }

  const body = buildTripsafeBookBody({ bid, amount, selection: sel });
  const r = await tripjackCall<TripsafeBookResponse>("tripsafe", "book", body);
  const supplier = r.ok ? r.data : undefined;
  const supplierErr = supplierErrors(supplier);
  if (!r.ok || supplierErr || !tripsafeBookSucceeded(supplier)) {
    const message = !r.ok ? r.error.message : supplierErr ?? "TripSafe did not confirm the booking.";
    await client
      .from("bookings")
      .update({ status: "failed", supplier_status: "failed", details: json({ ...(row.details as object), failure: message }) })
      .eq("id", row.id);
    await event(client, row.id, "supplier-error", `TripSafe booking failed: ${message}`, { correlationId: r.correlationId });
    return { booking: toInsuranceRecord(await loadOwned(client, row.id)), replay: false, message };
  }

  const supplierBid = supplier?.bid ?? supplier?.bookingId ?? bid;
  await client
    .from("bookings")
    .update({
      status: "pending",
      supplier_reference: supplierBid,
      supplier_status: "booked",
      details: json({ ...(row.details as object), correlationIds: { review: review.correlationId, book: r.correlationId } }),
    })
    .eq("id", row.id);
  await event(client, row.id, "supplier-booked", `Policy booked with TripSafe (${supplierBid}).`, {
    correlationId: r.correlationId,
  });

  // Authoritative status + policy ids come from Booking Details.
  const synced = await syncTripsafeBooking(client, row.id);
  return {
    booking: synced.booking,
    replay: false,
    message:
      synced.booking.status === "confirmed"
        ? `Policy issued${synced.booking.policyIds.length ? ` (${synced.booking.policyIds.join(", ")})` : ""}.`
        : "Policy request accepted by TripSafe; awaiting issuance confirmation.",
  };
}

/**
 * POST /oms/v1/insurance/booking-details { bookingId } → order.status and
 * per-traveller policyId; policy ids are stored as Worldway booking documents.
 */
export async function syncTripsafeBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: InsuranceBookingRecord; message: string }> {
  const row = await loadOwned(client, bookingId);
  if (!row.supplier_reference) return { booking: toInsuranceRecord(row), message: "No supplier reference yet." };
  const r = await tripjackCall<Record<string, unknown>>("tripsafe", "booking-details", { bookingId: row.supplier_reference });
  if (!r.ok) return { booking: toInsuranceRecord(row), message: r.error.message };
  const order = (r.data?.order ?? {}) as Record<string, unknown>;
  const supplierStatus = typeof order.status === "string" ? order.status : undefined;
  const policies = extractTripsafePolicies(r.data);
  const details = (row.details ?? {}) as Record<string, unknown>;
  const status = supplierStatus ? mapInsuranceStatus(supplierStatus) : row.status;
  const paid = status === "confirmed";
  await client
    .from("bookings")
    .update({
      status,
      supplier_status: supplierStatus ?? row.supplier_status,
      amount_paid: paid ? row.amount ?? 0 : row.amount_paid,
      balance_due: paid ? 0 : row.balance_due,
      details: json({ ...details, policies, lastSyncCorrelationId: r.correlationId }),
    })
    .eq("id", row.id);

  // Policy documents: one per traveller policyId, idempotent on reference.
  if (policies.length) {
    const { data: existing } = await client
      .from("booking_documents")
      .select("reference")
      .eq("booking_id", row.id)
      .eq("doc_type", "policy");
    const have = new Set((existing ?? []).map((d) => d.reference));
    const fresh = policies.filter((p) => !have.has(p.policyId));
    if (fresh.length) {
      await client.from("booking_documents").insert(
        fresh.map((p) => ({
          booking_id: row.id,
          user_id: row.user_id,
          doc_type: "policy",
          title: `Travel policy ${p.policyId}${p.fn || p.ln ? ` — ${[p.fn, p.ln].filter(Boolean).join(" ")}` : ""}`,
          reference: p.policyId,
          content: json({ supplier: TRIPJACK_INSURANCE_SUPPLIER, environment: "uat", policyId: p.policyId, travellerId: p.travellerId, plid: p.plid, pid: p.pid }),
        })),
      );
      await event(client, row.id, "document", `Policy id${fresh.length > 1 ? "s" : ""} received: ${fresh.map((p) => p.policyId).join(", ")}.`, {
        correlationId: r.correlationId,
      });
    }
  }
  return { booking: toInsuranceRecord(await loadOwned(client, row.id)), message: "Synchronised." };
}

/**
 * Documented two-step cancellation: Raise (type CANCELLATION, travellerKeys)
 * → Confirm (type INSURANCE_CANCELLATION, amendmentId, travellerKeys).
 * Enforces the supplier's 24-hours-before-coverage rule before any call.
 * `travellerIds` limits the cancellation to specific pax (partial cancel).
 */
export async function cancelTripsafeBooking(
  client: Client,
  bookingId: string,
  reason: string,
  travellerIds?: number[],
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
  if (!row.travel_date || !isTripsafeCancellable(row.travel_date)) {
    return {
      booking: toInsuranceRecord(row),
      message: "TripSafe cancellations must be raised at least 24 hours before the coverage start date.",
    };
  }

  const details = (row.details ?? {}) as Record<string, unknown>;
  const plid = typeof details.plid === "string" ? details.plid : undefined;
  const pid = typeof details.pid === "string" ? details.pid : undefined;
  const travellers = Array.isArray(details.travellers) ? (details.travellers as Array<{ id?: number }>) : [];
  const allIds = travellers.map((t) => t.id).filter((v): v is number => typeof v === "number");
  const ids = travellerIds?.length ? allIds.filter((id) => travellerIds.includes(id)) : allIds;
  if (!plid || !pid || !ids.length) {
    return { booking: toInsuranceRecord(row), message: "Plan or traveller keys are missing for this booking." };
  }
  const keys = buildTravellerKeys(plid, pid, ids);

  const raise = await tripjackCall<TripsafeAmendmentResponse>("tripsafe", "amend", buildTripsafeRaiseBody(row.supplier_reference, keys));
  if (!raise.ok) {
    await event(client, row.id, "supplier-error", `TripSafe amendment failed: ${raise.error.message}`, { correlationId: raise.correlationId });
    return { booking: toInsuranceRecord(row), message: raise.error.message };
  }
  const raiseErr = supplierErrors(raise.data);
  if (raiseErr) {
    await event(client, row.id, "supplier-error", `TripSafe amendment rejected: ${raiseErr}`, { correlationId: raise.correlationId });
    return { booking: toInsuranceRecord(row), message: raiseErr };
  }
  const raised = extractAmendment(raise.data, row.supplier_reference);
  const amendmentId = raised?.amendmentId;
  if (!amendmentId) {
    return { booking: toInsuranceRecord(row), message: "Supplier did not return an amendment id." };
  }
  await event(client, row.id, "amendment-raised", `Cancellation raised with TripSafe (${amendmentId}).`, {
    correlationId: raise.correlationId,
    amendmentId,
    refund: raised?.amount,
  });

  const confirm = await tripjackCall<TripsafeAmendmentResponse>(
    "tripsafe",
    "cancel",
    buildTripsafeConfirmBody(amendmentId, row.supplier_reference, keys),
  );
  if (!confirm.ok) {
    await event(client, row.id, "supplier-error", `TripSafe cancellation confirm failed: ${confirm.error.message}`, { correlationId: confirm.correlationId, amendmentId });
    return { booking: toInsuranceRecord(row), message: confirm.error.message };
  }
  const confirmErr = supplierErrors(confirm.data);
  if (confirmErr) {
    await event(client, row.id, "supplier-error", `TripSafe cancellation rejected: ${confirmErr}`, { correlationId: confirm.correlationId, amendmentId });
    return { booking: toInsuranceRecord(row), message: confirmErr };
  }
  const confirmed = extractAmendment(confirm.data, row.supplier_reference);
  const confirmedStatus = (confirmed?.status ?? "").toUpperCase();
  if (confirmedStatus && confirmedStatus !== "SUCCESS") {
    await event(client, row.id, "supplier-error", `TripSafe cancellation status ${confirmed?.status}.`, { correlationId: confirm.correlationId, amendmentId });
    return { booking: toInsuranceRecord(row), message: `Cancellation status: ${confirmed?.status}.` };
  }
  const partial = ids.length < allIds.length;
  await client
    .from("bookings")
    .update({
      status: partial ? row.status : "cancelled",
      supplier_status: partial ? "partially-cancelled" : confirmed?.status ?? "cancelled",
      cancellation_reason: reason,
      details: json({
        ...details,
        cancellation: { amendmentId, travellerIds: ids, partial, refund: raised?.amount, correlationIds: { raise: raise.correlationId, confirm: confirm.correlationId } },
      }),
    })
    .eq("id", row.id);
  await event(client, row.id, "cancelled", partial ? `Policy cancelled for traveller(s) ${ids.join(", ")}.` : "Policy cancelled with TripSafe.", {
    amendmentId,
    correlationId: confirm.correlationId,
  });
  return { booking: toInsuranceRecord(await loadOwned(client, row.id)), message: partial ? "Selected travellers cancelled." : "Policy cancelled." };
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
