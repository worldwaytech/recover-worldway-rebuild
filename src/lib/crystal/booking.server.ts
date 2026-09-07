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
  listAvailableSuites,
  normaliseSupplierBooking,
} from "./aktg-booking.server";
import { revalidateAktgVoyage } from "./aktg.server";

type Client = SupabaseClient<Database>;
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const SUPPLIER = "Crystal Cruises (AKTG)";
/** Tolerance on the price the customer saw versus the live supplier fare. */
const PRICE_TOLERANCE = 0.02;
/**
 * AKTG's hold response carries no expiry, so we impose our own window. A held
 * suite that has not been optioned by then is released automatically.
 */
export function holdTtlMinutes(): number {
  const n = Number(process.env["CRYSTAL_HOLD_TTL_MINUTES"] ?? "");
  return Number.isFinite(n) && n >= 5 && n <= 1440 ? n : 30;
}

/** True when the row is a supplier-held suite that has not yet become a booking. */
export function isSuiteHeld(row: BookingRow): boolean {
  const d = details(row);
  return d.suiteHeld === true && row.status === "held";
}

function holdExpired(row: BookingRow): boolean {
  const at = details(row).holdExpiresAt;
  return typeof at === "string" && Date.parse(at) < Date.now();
}

/**
 * Release a held suite with the supplier (documented DELETE /v1/Bookings/suites).
 * A 404 means the suite is no longer held for us, which is the desired end state.
 */
async function releaseHeldSuite(row: BookingRow): Promise<"released" | "failed"> {
  const d = details(row);
  const suiteNumber = Number(d.suiteNumber ?? NaN);
  const voyageNumber = String(d.voyageNumber ?? "");
  if (!Number.isFinite(suiteNumber) || !voyageNumber) return "failed";
  try {
    await bookingCall<unknown>({
      operation: "suites",
      body: [{ voyageNumber, suiteNumber }],
      reference: row.reference,
    });
    return "released";
  } catch (err) {
    if (err instanceof Error && /responded 404/.test(err.message)) return "released";
    return "failed";
  }
}

type Json = Database["public"]["Tables"]["bookings"]["Insert"]["details"];

/** Serialise a plain object into the jsonb column type. */
function json(value: unknown): Json {
  return value as Json;
}

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

  // Spec: POST /v1/Bookings/suites holds one or more suites before booking
  // creation, and requires an integer suiteNumber per voyage. Without an
  // allocated suite number we never call the supplier (fail-closed) and the
  // request is routed to the Crystal desk instead.
  const suiteNumber = input.suiteNumber;
  if (capability.live && suiteNumber === undefined) {
    blockedReason = "booking_api_not_configured";
  } else if (capability.live) {
    try {
      // Re-confirm the chosen suite is still open via the documented
      // available-suites operation (voyage + category + price type + currency)
      // so we never hold a suite the customer was not offered.
      const categoryCod = match.gradeId ?? input.gradeId;
      const priceTypeCod = match.fareCode ?? input.fareCode;
      if (categoryCod && priceTypeCod) {
        const open = await listAvailableSuites({
          voyageNumber: input.voyageNumber,
          suiteCategoryCod: categoryCod,
          priceTypeCod,
          currency: input.currency,
        });
        const stillOpen = open.find((s) => s.suiteNumber === suiteNumber && s.available);
        if (!stillOpen) {
          throw new Error(
            `Suite ${suiteNumber} is no longer available in this grade. Please choose another suite.`,
          );
        }
      }
      const raw = await bookingCall<unknown>({
        operation: "prebook",
        body: [{ voyageNumber: input.voyageNumber, suiteNumber }],
        idempotencyKey: input.idempotencyKey,
      });
      const norm = normaliseSupplierBooking(raw);
      held =
        norm.supplierReference !== undefined ||
        (raw as { result?: boolean } | null)?.result === true;
      // A hold is NOT a booking: the documented HoldReleaseSuiteResponse carries
      // only `result: true`. We never invent a booking reference from the suite
      // number, otherwise retrieve/cancel would address the wrong resource.
      supplierReference = norm.supplierReference;
      supplierStatusRaw = norm.supplierStatus ?? (held ? "held" : undefined);
      // Supplier gives no expiry, so we impose our own release window.
      holdExpiresAt =
        norm.holdExpiresAt ??
        (held ? new Date(Date.now() + holdTtlMinutes() * 60_000).toISOString() : undefined);
    } catch (err) {
      if (err instanceof CrystalBookingUnavailableError) blockedReason = err.reason;
      else throw err;
    }
  } else {
    blockedReason = capability.reason;
  }

  const status: CrystalBookingStatus = held
    ? "held"
    : supplierReference
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
    details: json({
      voyageNumber: input.voyageNumber,
      shipName: input.shipName ?? null,
      suiteCategory: match.suiteCategory,
      suiteNumber: input.suiteNumber ?? null,
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
      /** True while a real supplier suite hold is outstanding (no booking yet). */
      suiteHeld: held,
      holdExpiresAt: holdExpiresAt ?? null,
      depositPercent: live.depositPercent ?? null,
      depositDueDate: live.depositDueDate ?? null,
      finalPaymentDate: live.finalPaymentDate ?? null,
      cancellationPolicy: live.cancellationPolicy ?? null,
      supplierPending: !held && !supplierReference,
      supplierBlockedReason: blockedReason ?? null,
      revalidatedAt: live.checkedAt,
    }),
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

  // Spec: POST /v1/Bookings/option — creates the firm booking (Option) from the
  // held suite. agentEmail, priceTypeCode, currency and voyages are required.
  const d = row.details as Record<string, unknown>;
  const agentEmail = (process.env["CRYSTAL_BOOKING_AGENT_EMAIL"] ?? "").trim();
  const priceTypeCode = String(d.fareCode ?? "").trim();
  const suiteCategoryCode = String(d.suiteCategory ?? "").trim();
  const suiteNumber = Number(d.suiteNumber ?? NaN);
  if (!agentEmail || !priceTypeCode || !suiteCategoryCode || !Number.isFinite(suiteNumber)) {
    await event(client, row.id, "booking-request", "Option creation deferred to the Crystal desk.", {
      missing: {
        agentEmail: !agentEmail,
        priceTypeCode: !priceTypeCode,
        suiteCategoryCode: !suiteCategoryCode,
        suiteNumber: !Number.isFinite(suiteNumber),
      },
    });
    return {
      booking: toRecord(row),
      confirmed: false,
      blockedReason: "booking_api_not_configured",
      message:
        "Your reservation is with our Crystal desk — the supplier option payload is not fully configured for this account.",
    };
  }
  const raw = await bookingCall<unknown>({
    operation: "option",
    body: {
      guests: (Array.isArray(d.guests) ? (d.guests as Record<string, unknown>[]) : []).map((g) => ({
        firstName: g.firstName,
        lastName: g.lastName,
        ...(g.email ? { email: g.email } : {}),
        ...(g.phone ? { phone: g.phone } : {}),
        ...(g.nationality ? { countryISO3Code: g.nationality } : {}),
      })),
      agentEmail,
      priceTypeCode,
      currency: row.currency,
      voyages: [
        {
          voyageNumber: String(d.voyageNumber ?? ""),
          suiteCategoryCode,
          suiteNumber,
        },
      ],
      ...(d.notes ? { note: String(d.notes).slice(0, 255) } : {}),
    },
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
      details: json({
        ...(row.details as Record<string, unknown>),
        supplierPending: false,
        confirmedAt: new Date().toISOString(),
      }),
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
      pathParams: { bookingId: row.supplier_reference },
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
      pathParams: { bookingId: row.supplier_reference },
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

/**
 * Booking history (spec: GET /v1/bookings/history/{bookingId}) — read-only.
 * Returns null when the rail is not armed or no supplier reference exists.
 */
export async function crystalBookingHistory(
  client: Client,
  bookingId: string,
): Promise<{ history: Record<string, unknown> | null; supplierSynced: boolean }> {
  const row = await ownedBooking(client, bookingId);
  const capability = bookingCapability();
  if (!capability.live || !row.supplier_reference) return { history: null, supplierSynced: false };
  try {
    const raw = await bookingCall<Record<string, unknown>>({
      operation: "history",
      pathParams: { bookingId: row.supplier_reference },
      reference: row.reference,
    });
    return { history: raw, supplierSynced: true };
  } catch {
    return { history: null, supplierSynced: false };
  }
}
