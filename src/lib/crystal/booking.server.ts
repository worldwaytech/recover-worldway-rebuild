// Crystal Cruises booking orchestration — server only.
// Persists into the existing WorldwayLuxe booking architecture (bookings,
// booking_events, booking_requests) using the caller's RLS-scoped client, so
// tenant isolation is enforced by the database, not by application code.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CRYSTAL_PRODUCT_TYPE,
  mapSupplierStatus,
  type CrystalBookingRecord,
  type CrystalBookingStatus,
  type CrystalHoldInput,
} from "./booking-contract";
import {
  CrystalBookingUnavailableError,
  bookingCall,
  bookingCapability,
  normaliseSupplierBooking,
} from "./aktg-booking.server";
import { revalidateAktgVoyage } from "./aktg.server";

type Client = SupabaseClient<Database>;
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const SUPPLIER = "Crystal Cruises (AKTG)";
/** Tolerance on the price the customer saw versus the live supplier fare. */
const PRICE_TOLERANCE = 0.02;

function reference(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CRZ-${new Date().getFullYear()}-${rand}`;
}

function details(row: BookingRow): Record<string, unknown> {
  return (row.details ?? {}) as Record<string, unknown>;
}

export function toRecord(row: BookingRow): CrystalBookingRecord {
  const d = details(row);
  return {
    id: row.id,
    reference: row.reference,
    status: row.status as CrystalBookingStatus,
    voyageNumber: String(d.voyageNumber ?? ""),
    title: row.title,
    shipName: d.shipName ? String(d.shipName) : undefined,
    travelDate: row.travel_date ?? undefined,
    suiteCategory: d.suiteCategory ? String(d.suiteCategory) : undefined,
    currency: row.currency,
    amount: row.amount ?? undefined,
    amountPaid: row.amount_paid,
    balanceDue: row.balance_due,
    supplierReference: row.supplier_reference ?? undefined,
    supplierStatus: row.supplier_status,
    guests: Number(d.guestCount ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supplierPending: d.supplierPending === true,
    cancellationReason: row.cancellation_reason ?? undefined,
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
    .insert({ booking_id: bookingId, event_type: eventType, summary, detail });
}

async function findByIdempotency(client: Client, key: string): Promise<BookingRow | null> {
  const { data } = await client
    .from("bookings")
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  return data ?? null;
}

export interface HoldOutcome {
  booking: CrystalBookingRecord;
  /** True when a real supplier hold was created. */
  supplierHold: boolean;
  holdExpiresAt?: string;
  livePricePerGuest?: number;
  blockedReason?: string;
  message: string;
}

/**
 * Search → cabin selection → availability/pricing → HOLD.
 * The live supplier fare is always revalidated before anything is persisted, so
 * no customer can hold or transact on a stale cached price.
 */
export async function holdCrystalVoyage(
  client: Client,
  userId: string,
  input: CrystalHoldInput,
): Promise<HoldOutcome> {
  const existing = await findByIdempotency(client, input.idempotencyKey);
  if (existing) {
    return {
      booking: toRecord(existing),
      supplierHold: Boolean(existing.supplier_reference),
      message: "Existing request returned (idempotent replay).",
    };
  }

  const live = await revalidateAktgVoyage(input.voyageNumber, input.currency);
  if (!live.live) {
    throw new Error(
      live.error ?? "Crystal could not confirm live availability for this voyage right now.",
    );
  }
  const match =
    live.fares.find(
      (f) =>
        (input.fareCode && f.fareCode === input.fareCode) ||
        (input.gradeId && f.gradeId === input.gradeId) ||
        f.suiteCategory === input.suiteCategory,
    ) ?? null;
  if (!match || match.price <= 0) {
    throw new Error("That suite grade is no longer offered on this sailing.");
  }
  if (match.available === false) {
    throw new Error("That suite grade is no longer available on this sailing.");
  }
  const drift = Math.abs(match.price - input.quotedPricePerGuest) / match.price;
  const livePrice = match.price;
  const guests = input.guests.length;
  const total = Math.round(livePrice * guests * 100) / 100;

  const capability = bookingCapability();
  let supplierReference: string | undefined;
  let supplierStatusRaw: string | undefined;
  let holdExpiresAt: string | undefined;
  let blockedReason: string | undefined;

  if (capability.live) {
    try {
      const raw = await bookingCall<unknown>({
        operation: "prebook",
        body: {
          voyageNumber: input.voyageNumber,
          currency: input.currency,
          fareCode: match.fareCode,
          gradeId: match.gradeId,
          guests: input.guests,
          leadContact: { email: input.leadEmail, phone: input.leadPhone },
          notes: input.notes,
        },
        idempotencyKey: input.idempotencyKey,
      });
      const norm = normaliseSupplierBooking(raw);
      supplierReference = norm.supplierReference;
      supplierStatusRaw = norm.supplierStatus ?? "held";
      holdExpiresAt = norm.holdExpiresAt;
    } catch (err) {
      if (err instanceof CrystalBookingUnavailableError) blockedReason = err.reason;
      else throw err;
    }
  } else {
    blockedReason = capability.reason;
  }

  const status: CrystalBookingStatus = supplierReference
    ? mapSupplierStatus(supplierStatusRaw)
    : "awaiting_supplier";

  const insert: Database["public"]["Tables"]["bookings"]["Insert"] = {
    user_id: userId,
    reference: reference(),
    product_type: CRYSTAL_PRODUCT_TYPE,
    title: input.voyageTitle,
    travel_date: input.departureDate ?? null,
    status,
    amount: total,
    currency: input.currency,
    supplier: SUPPLIER,
    supplier_reference: supplierReference ?? null,
    supplier_status: supplierStatusRaw ?? (blockedReason ? "awaiting_supplier_api" : "pending"),
    amount_paid: 0,
    balance_due: total,
    deposit_amount:
      live.depositPercent && live.depositPercent > 0
        ? Math.round(((total * live.depositPercent) / 100) * 100) / 100
        : null,
    idempotency_key: input.idempotencyKey,
    details: {
      voyageNumber: input.voyageNumber,
      shipName: input.shipName ?? null,
      suiteCategory: match.suiteCategory,
      gradeId: match.gradeId ?? null,
      gradeName: match.gradeName ?? null,
      fareCode: match.fareCode ?? null,
      fareType: match.fareType ?? null,
      pricePerGuest: livePrice,
      quotedPricePerGuest: input.quotedPricePerGuest,
      priceDriftPercent: Math.round(drift * 10_000) / 100,
      priceChanged: drift > PRICE_TOLERANCE,
      guestCount: guests,
      guests: input.guests,
      leadEmail: input.leadEmail,
      leadPhone: input.leadPhone,
      notes: input.notes ?? null,
      holdExpiresAt: holdExpiresAt ?? null,
      depositPercent: live.depositPercent ?? null,
      depositDueDate: live.depositDueDate ?? null,
      finalPaymentDate: live.finalPaymentDate ?? null,
      cancellationPolicy: live.cancellationPolicy ?? null,
      supplierPending: !supplierReference,
      supplierBlockedReason: blockedReason ?? null,
      revalidatedAt: live.checkedAt,
    },
  };

  const { data, error } = await client.from("bookings").insert(insert).select("*").single();
  if (error) {
    // Unique idempotency violation → return the winning row.
    const replay = await findByIdempotency(client, input.idempotencyKey);
    if (replay)
      return {
        booking: toRecord(replay),
        supplierHold: Boolean(replay.supplier_reference),
        message: "Existing request returned (idempotent replay).",
      };
    throw new Error(error.message);
  }

  await event(
    client,
    data.id,
    supplierReference ? "supplier-hold" : "booking-request",
    supplierReference
      ? `Suite held with Crystal (${match.suiteCategory}).`
      : `Cruise request registered for ${input.voyageTitle}.`,
    {
      voyageNumber: input.voyageNumber,
      pricePerGuest: livePrice,
      guests,
      supplierPending: !supplierReference,
    },
  );

  return {
    booking: toRecord(data),
    supplierHold: Boolean(supplierReference),
    holdExpiresAt,
    livePricePerGuest: livePrice,
    blockedReason,
    message: supplierReference
      ? "Your suite is held with Crystal."
      : "Your request is registered and a Crystal specialist will confirm the reservation.",
  };
}

async function ownedBooking(client: Client, bookingId: string): Promise<BookingRow> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("product_type", CRYSTAL_PRODUCT_TYPE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found.");
  return data;
}

export interface ConfirmOutcome {
  booking: CrystalBookingRecord;
  confirmed: boolean;
  blockedReason?: string;
  message: string;
}

/** HOLD → BOOKING → CONFIRMATION. */
export async function confirmCrystalBooking(
  client: Client,
  bookingId: string,
  idempotencyKey: string,
): Promise<ConfirmOutcome> {
  const row = await ownedBooking(client, bookingId);
  if (row.status === "confirmed") {
    return { booking: toRecord(row), confirmed: true, message: "Already confirmed." };
  }
  if (row.status === "cancelled") throw new Error("This booking has been cancelled.");

  const capability = bookingCapability();
  if (!capability.live || !row.supplier_reference) {
    const { data } = await client
      .from("bookings")
      .update({
        status: "pending_confirmation",
        supplier_status: row.supplier_reference ? row.supplier_status : "awaiting_supplier_api",
      })
      .eq("id", row.id)
      .select("*")
      .single();
    await event(
      client,
      row.id,
      "booking-request",
      "Confirmation requested; awaiting Crystal reservation rail.",
      { reason: capability.reason ?? "supplier_reference_missing" },
    );
    return {
      booking: toRecord(data ?? row),
      confirmed: false,
      blockedReason: capability.reason ?? "booking_api_not_authorised",
      message:
        "Your reservation request is with our Crystal desk — supplier auto-confirmation is not yet enabled for this account.",
    };
  }

  const raw = await bookingCall<unknown>({
    operation: "create",
    body: { bookingReference: row.supplier_reference },
    idempotencyKey,
    reference: row.reference,
  });
  const norm = normaliseSupplierBooking(raw);
  const status = mapSupplierStatus(norm.supplierStatus);
  const { data } = await client
    .from("bookings")
    .update({
      status,
      supplier_reference: norm.supplierReference ?? row.supplier_reference,
      supplier_status: norm.supplierStatus ?? row.supplier_status,
      details: {
        ...(row.details as Record<string, unknown>),
        supplierPending: false,
        confirmedAt: new Date().toISOString(),
      },
    })
    .eq("id", row.id)
    .select("*")
    .single();
  await event(client, row.id, "supplier-confirmation", `Crystal reservation ${status}.`, {
    supplierStatus: norm.supplierStatus ?? null,
  });
  return {
    booking: toRecord(data ?? row),
    confirmed: status === "confirmed",
    message: status === "confirmed" ? "Crystal has confirmed your reservation." : "Reservation submitted.",
  };
}

/** Retrieve / history — supplier state refreshed when the rail is live. */
export async function retrieveCrystalBooking(
  client: Client,
  bookingId: string,
): Promise<{ booking: CrystalBookingRecord; supplierSynced: boolean }> {
  const row = await ownedBooking(client, bookingId);
  const capability = bookingCapability();
  if (!capability.live || !row.supplier_reference) {
    return { booking: toRecord(row), supplierSynced: false };
  }
  try {
    const raw = await bookingCall<unknown>({
      operation: "retrieve",
      method: "GET",
      query: { bookingReference: row.supplier_reference },
      reference: row.reference,
    });
    const norm = normaliseSupplierBooking(raw);
    const status = mapSupplierStatus(norm.supplierStatus);
    const { data } = await client
      .from("bookings")
      .update({ status, supplier_status: norm.supplierStatus ?? row.supplier_status })
      .eq("id", row.id)
      .select("*")
      .single();
    return { booking: toRecord(data ?? row), supplierSynced: true };
  } catch {
    return { booking: toRecord(row), supplierSynced: false };
  }
}

export async function listCrystalBookings(client: Client): Promise<CrystalBookingRecord[]> {
  const { data, error } = await client
    .from("bookings")
    .select("*")
    .eq("product_type", CRYSTAL_PRODUCT_TYPE)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRecord);
}

export interface CancelOutcome {
  booking: CrystalBookingRecord;
  cancelled: boolean;
  blockedReason?: string;
  message: string;
}

/** CANCELLATION — supplier cancellation when live, tracked request otherwise. */
export async function cancelCrystalBooking(
  client: Client,
  userId: string,
  bookingId: string,
  reason: string,
): Promise<CancelOutcome> {
  const row = await ownedBooking(client, bookingId);
  if (row.status === "cancelled") {
    return { booking: toRecord(row), cancelled: true, message: "Already cancelled." };
  }
  const capability = bookingCapability();

  if (capability.live && row.supplier_reference) {
    const raw = await bookingCall<unknown>({
      operation: "cancel",
      body: { bookingReference: row.supplier_reference, reason },
      reference: row.reference,
    });
    const norm = normaliseSupplierBooking(raw);
    const status = mapSupplierStatus(norm.supplierStatus ?? "cancelled");
    const { data } = await client
      .from("bookings")
      .update({
        status,
        supplier_status: norm.supplierStatus ?? "cancelled",
        cancellation_reason: reason,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    await event(client, row.id, "cancellation", "Crystal cancellation processed.", {
      supplierStatus: norm.supplierStatus ?? null,
    });
    return {
      booking: toRecord(data ?? row),
      cancelled: status === "cancelled",
      message: "Your Crystal reservation has been cancelled.",
    };
  }

  await client.from("booking_requests").insert({
    booking_id: row.id,
    user_id: userId,
    request_type: "cancellation",
    details: reason,
    status: "open",
  });
  const { data } = await client
    .from("bookings")
    .update({ status: "cancellation_requested", cancellation_reason: reason })
    .eq("id", row.id)
    .select("*")
    .single();
  await event(client, row.id, "cancellation", "Cancellation requested by customer.", {
    reason: capability.reason ?? "supplier_reference_missing",
  });
  return {
    booking: toRecord(data ?? row),
    cancelled: false,
    blockedReason: capability.reason ?? "booking_api_not_authorised",
    message:
      "Cancellation requested — our Crystal desk will process it with the cruise line and confirm penalties.",
  };
}
