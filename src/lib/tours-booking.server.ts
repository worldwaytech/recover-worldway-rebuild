// Server-only G Adventures booking lifecycle, implemented against the official
// documented resources:
//   POST /bookings/            (container: currency + external_id)
//   POST /customers/           (traveller records)
//   POST /departure_services/  (booking.id + product.id + customers[] + rooms)
//   GET/PATCH /departure_services/{id}   (status: Option → Confirmed / Request Cancellation)
//   GET /bookings/{id}[/services|/invoices|/payments|/refunds|/documents|/checkins]
//   GET /requirements/{id}
// Fail-closed: a reservation is only ever reported as held/confirmed when the
// supplier itself returns that state. Credentials stay server-side.

import {
  gFetch,
  toursConfigured,
  toursBookingConfigured,
  checkDepartureAvailability,
  recordWriteScope,
} from "./tours.server";
import { isWriteScopeDenied, type ToursWriteScope } from "./tours-scope";

/** JSON-safe supplier payload (server functions must return serialisable data). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type TourTraveller = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  dateOfBirth?: string;
  nationalityId?: string;
};

export type TourBookingInput = {
  departureId: string;
  roomCode: string;
  tourName: string;
  startDate: string;
  travellers: TourTraveller[];
  currency?: string;
};

export type IncompleteRequirement = {
  type: string;
  code: string;
  name: string;
  message: string;
  customerId: string | null;
};

type RawBooking = {
  id?: string;
  external_id?: string;
  currency?: string;
  amount_paid?: string;
  amount_owing?: string;
  balance_due_date?: string | null;
  date_of_first_travel?: string | null;
};

type RawCustomer = { id?: string; name?: { legal_first_name?: string; legal_last_name?: string } };

type RawService = {
  id?: string;
  name?: string;
  status?: string;
  status_transitions?: string[];
  option_expiry_date?: string | null;
  purchase_price?: string | null;
  deposit?: string | null;
  date_confirmed?: string | null;
  date_cancelled?: string | null;
  rooms?: { code?: string; name?: string } | { code?: string; name?: string }[];
  booking?: { id?: string };
  incomplete_requirements?: {
    type?: string;
    code?: string;
    name?: string;
    message?: string;
    customer?: { id?: string };
  }[];
  documents?: { id?: string; type?: string }[] | null;
};

const CONFIRMED = "Confirmed";
const REQUEST_CANCELLATION = "Request Cancellation";

function mapRequirements(raw: RawService | null | undefined): IncompleteRequirement[] {
  return (raw?.incomplete_requirements ?? []).map((r) => ({
    type: r.type ?? "CONFIRMATION",
    code: r.code ?? "UNKNOWN",
    name: r.name ?? r.code ?? "Requirement",
    message: r.message ?? "",
    customerId: r.customer?.id ? String(r.customer.id) : null,
  }));
}

function roomOf(raw: RawService | null | undefined): string | null {
  const rooms = raw?.rooms;
  const first = Array.isArray(rooms) ? rooms[0] : rooms;
  return first?.name ?? first?.code ?? null;
}

function normaliseService(raw: RawService | undefined | null) {
  if (!raw) return null;
  return {
    id: raw.id ? String(raw.id) : null,
    name: raw.name ?? null,
    status: raw.status ?? null,
    statusTransitions: raw.status_transitions ?? [],
    optionExpiry: raw.option_expiry_date ?? null,
    purchasePrice: raw.purchase_price != null ? Number(raw.purchase_price) : null,
    deposit: raw.deposit != null ? Number(raw.deposit) : null,
    dateConfirmed: raw.date_confirmed ?? null,
    dateCancelled: raw.date_cancelled ?? null,
    room: roomOf(raw),
    bookingId: raw.booking?.id ? String(raw.booking.id) : null,
    incompleteRequirements: mapRequirements(raw),
    documents: raw.documents ?? [],
  };
}

export type NormalisedService = NonNullable<ReturnType<typeof normaliseService>>;

// ---------- customers ----------

/** Creates one supplier customer record per traveller (documented POST /customers/). */
export async function createTourCustomers(travellers: TourTraveller[]) {
  const ids: string[] = [];
  for (const t of travellers) {
    const res = await gFetch<RawCustomer>("/customers", {
      method: "POST",
      body: {
        name: {
          legal_first_name: t.firstName,
          legal_last_name: t.lastName,
          title: t.title ?? "Mr",
        },
        account_email: t.email,
        ...(t.dateOfBirth ? { date_of_birth: t.dateOfBirth } : {}),
        ...(t.nationalityId ? { nationality: { id: t.nationalityId } } : {}),
        ...(t.phone ? { phone_numbers: [{ type: "MOBILE", number: t.phone }] } : {}),
      },
    });
    if (!res.ok || !res.data?.id) {
      return { ok: false as const, status: res.status, error: res.error, ids };
    }
    ids.push(String(res.data.id));
  }
  return { ok: true as const, status: 201, ids };
}

/** Amendment: patch a traveller record to satisfy outstanding requirements. */
export async function updateTourCustomer(
  customerId: string,
  patch: {
    dateOfBirth?: string;
    nationalityId?: string;
    passportNumber?: string;
    passportExpiry?: string;
  },
) {
  const body: Record<string, unknown> = {};
  if (patch.dateOfBirth) body["date_of_birth"] = patch.dateOfBirth;
  if (patch.nationalityId) body["nationality"] = { id: patch.nationalityId };
  if (patch.passportNumber || patch.passportExpiry) {
    body["passport"] = {
      ...(patch.passportNumber ? { number: patch.passportNumber } : {}),
      ...(patch.passportExpiry ? { expiry_date: patch.passportExpiry } : {}),
    };
  }
  const res = await gFetch<RawCustomer>(`/customers/${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    body,
  });
  return { ok: res.ok, status: res.status, error: res.error };
}

// ---------- reservation chain ----------

/**
 * Documented reservation chain:
 *   1. live availability re-check (fail closed)
 *   2. POST /bookings/            → booking container
 *   3. POST /customers/           → traveller records
 *   4. POST /departure_services/  → holds the departure (status "Option")
 *   5. GET  /bookings/{id}        → live balance/amount owing
 * A 401/403 on any write means G Adventures has not enabled booking scope on
 * the application key; the caller is told explicitly so the lead is captured.
 */
export async function createTourBooking(input: TourBookingInput) {
  if (!toursConfigured()) {
    return {
      ok: false,
      status: 503,
      needsCredentials: true,
      error: "Tour supplier credentials are not configured yet.",
    };
  }
  if (!toursBookingConfigured()) {
    return {
      ok: false,
      status: 503,
      needsCredentials: true,
      error: "Agency code required before live reservations can be issued.",
    };
  }
  const currency = (input.currency ?? "USD").toUpperCase();
  const lead = input.travellers[0];

  const check = await checkDepartureAvailability(
    input.departureId,
    input.roomCode,
    input.travellers.length,
    currency,
  );
  if (!check.bookable) {
    return {
      ok: false,
      status: 409,
      soldOut: true,
      error: check.reason ?? "This departure is no longer available.",
      availability: check,
    };
  }
  const roomCode = check.room?.code || input.roomCode || "STANDARD";
  const externalId = `WWTG-${Date.now().toString(36).toUpperCase()}`;

  const bookingRes = await gFetch<RawBooking>("/bookings", {
    method: "POST",
    body: { currency, external_id: externalId },
  });
  if (!bookingRes.ok || !bookingRes.data?.id) {
    const denied = isWriteScopeDenied(bookingRes.status);
    if (denied) recordWriteScope("READ_ONLY");
    return {
      ok: false,
      status: bookingRes.status,
      needsBookingPermission: denied,
      writeScope: (denied ? "READ_ONLY" : "UNKNOWN") as ToursWriteScope,
      error: denied
        ? "Instant confirmation is not available for this departure right now."
        : (bookingRes.error ?? "Reservation could not be created."),
      availability: check,
    };
  }
  const bookingId = String(bookingRes.data.id);

  const customers = await createTourCustomers(input.travellers);
  if (!customers.ok) {
    const denied = isWriteScopeDenied(customers.status);
    if (denied) recordWriteScope("READ_ONLY");
    return {
      ok: false,
      status: customers.status,
      bookingId,
      needsBookingPermission: denied,
      writeScope: (denied ? "READ_ONLY" : "UNKNOWN") as ToursWriteScope,
      error: denied
        ? "Instant confirmation is not available for this departure right now."
        : (customers.error ?? "Traveller records could not be created."),
      availability: check,
    };
  }

  const serviceRes = await gFetch<RawService>("/departure_services", {
    method: "POST",
    body: {
      booking: { id: bookingId },
      product: { id: input.departureId },
      customers: customers.ids.map((id) => ({ id })),
      rooms: [{ code: roomCode }],
    },
  });
  const serviceDenied = isWriteScopeDenied(serviceRes.status);
  recordWriteScope(serviceDenied ? "READ_ONLY" : serviceRes.ok ? "BOOKING_ENABLED" : "UNKNOWN");
  if (!serviceRes.ok || !serviceRes.data?.id) {
    return {
      ok: false,
      status: serviceRes.status,
      bookingId,
      customerIds: customers.ids,
      needsBookingPermission: serviceDenied,
      writeScope: (serviceDenied ? "READ_ONLY" : "UNKNOWN") as ToursWriteScope,
      error: serviceDenied
        ? "Instant confirmation is not available for this departure right now."
        : (serviceRes.error ?? "The departure could not be held with the operator."),
      availability: check,
    };
  }

  const service = normaliseService(serviceRes.data)!;
  const finalRes = await gFetch<RawBooking>(`/bookings/${bookingId}`);
  const live = finalRes.data;

  return {
    ok: true,
    status: 200,
    writeScope: "BOOKING_ENABLED" as ToursWriteScope,
    bookingId,
    customerIds: customers.ids,
    serviceId: service.id,
    // Supplier truth only: "Option" until G Adventures confirms it.
    serviceStatus: service.status,
    bookingStatus: service.status,
    optionExpiry: service.optionExpiry,
    incompleteRequirements: service.incompleteRequirements,
    confirmationBlockers: service.incompleteRequirements.filter((r) => r.type === "CONFIRMATION"),
    amountDue: service.deposit ?? (live?.amount_owing != null ? Number(live.amount_owing) : null),
    amountOwing: live?.amount_owing != null ? Number(live.amount_owing) : null,
    balanceDueDate: live?.balance_due_date ?? null,
    currency: live?.currency ?? currency,
    reference: externalId,
    externalId,
    lead: lead?.email ?? null,
    totalPrice: service.purchasePrice ?? check.totalPrice ?? null,
    room: service.room ?? roomCode,
  };
}

// ---------- confirmation ----------

async function resolveServiceId(bookingId: string, serviceId?: string) {
  if (serviceId) return serviceId;
  const res = await gFetch<{ results?: RawService[] }>(
    `/bookings/${encodeURIComponent(bookingId)}/services`,
  );
  const first = (res.data?.results ?? []).find((s) => s.id);
  return first?.id ? String(first.id) : null;
}

/**
 * Confirms a held departure service. Documented flow: all CONFIRMATION
 * requirements must be satisfied, then PATCH the service status to "Confirmed".
 * Fail-closed: the result is only `confirmed` when a re-read of the service
 * returns status "Confirmed".
 */
export async function confirmTourBooking(args: { bookingId: string; serviceId?: string }) {
  if (!toursBookingConfigured()) {
    return {
      ok: false,
      confirmed: false,
      status: 503,
      error: "Live booking credentials are not configured.",
    };
  }
  const serviceId = await resolveServiceId(args.bookingId, args.serviceId);
  if (!serviceId) {
    return {
      ok: false,
      confirmed: false,
      status: 404,
      error: "No departure service found on this reservation.",
    };
  }
  const before = await gFetch<RawService>(`/departure_services/${encodeURIComponent(serviceId)}`);
  if (!before.ok || !before.data) {
    return {
      ok: false,
      confirmed: false,
      status: before.status,
      needsBookingPermission: isWriteScopeDenied(before.status),
      error: before.error ?? "Reservation could not be read from the operator.",
    };
  }
  const current = normaliseService(before.data)!;
  if (current.status === CONFIRMED) {
    return { ok: true, confirmed: true, status: 200, service: current, bookingStatus: CONFIRMED };
  }
  const blockers = current.incompleteRequirements.filter((r) => r.type === "CONFIRMATION");
  if (blockers.length) {
    return {
      ok: false,
      confirmed: false,
      status: 409,
      requirementsOutstanding: true,
      blockers,
      service: current,
      error: `Operator requires: ${blockers.map((b) => b.name).join(", ")}.`,
    };
  }
  const patch = await gFetch<RawService>(`/departure_services/${encodeURIComponent(serviceId)}`, {
    method: "PATCH",
    body: { status: CONFIRMED },
  });
  const denied = isWriteScopeDenied(patch.status);
  if (denied) recordWriteScope("READ_ONLY");

  // Never trust the PATCH echo — re-read the supplier state.
  const after = await gFetch<RawService>(`/departure_services/${encodeURIComponent(serviceId)}`);
  const service = normaliseService(after.data);
  const confirmed = service?.status === CONFIRMED;
  return {
    ok: confirmed,
    confirmed,
    status: confirmed ? 200 : patch.status,
    needsBookingPermission: denied,
    writeScope: (denied ? "READ_ONLY" : confirmed ? "BOOKING_ENABLED" : "UNKNOWN") as ToursWriteScope,
    service,
    bookingStatus: service?.status ?? null,
    error: confirmed
      ? undefined
      : denied
        ? "Instant confirmation is not available for this reservation."
        : (patch.error ?? "The operator did not confirm this reservation."),
  };
}

// ---------- cancellation / amendment ----------

/** Requests cancellation of a held or confirmed service (documented status transition). */
export async function cancelTourBooking(args: { bookingId: string; serviceId?: string }) {
  if (!toursBookingConfigured()) {
    return { ok: false, status: 503, error: "Live booking credentials are not configured." };
  }
  const serviceId = await resolveServiceId(args.bookingId, args.serviceId);
  if (!serviceId) {
    return { ok: false, status: 404, error: "No departure service found on this reservation." };
  }
  const before = await gFetch<RawService>(`/departure_services/${encodeURIComponent(serviceId)}`);
  // The supplier publishes the allowed transitions on the service. When that
  // list is present we honour it exactly — an empty list means "no transition".
  const allowed = before.data?.status_transitions;
  if (before.ok && Array.isArray(allowed) && !allowed.includes(REQUEST_CANCELLATION)) {
    return {
      ok: false,
      status: 409,
      error: `Operator does not allow cancellation from status ${before.data?.status ?? "unknown"}.`,
      service: normaliseService(before.data),
    };
  }
  const patch = await gFetch<RawService>(`/departure_services/${encodeURIComponent(serviceId)}`, {
    method: "PATCH",
    body: { status: REQUEST_CANCELLATION },
  });
  const after = await gFetch<RawService>(`/departure_services/${encodeURIComponent(serviceId)}`);
  const service = normaliseService(after.data);
  const cancelling =
    service?.status === REQUEST_CANCELLATION || service?.status === "Cancelled";
  return {
    ok: cancelling,
    status: cancelling ? 200 : patch.status,
    needsBookingPermission: isWriteScopeDenied(patch.status),
    service,
    error: cancelling ? undefined : (patch.error ?? "The operator did not accept the cancellation."),
  };
}

// ---------- retrieval / documents / money ----------

export async function getTourBooking(bookingId: string) {
  if (!toursConfigured()) {
    return { ok: false, status: 503, error: "Tour supplier not configured." };
  }
  const id = encodeURIComponent(bookingId);
  const [booking, services, invoices, payments, refunds, documents, checkins] = await Promise.all([
    gFetch<RawBooking>(`/bookings/${id}`),
    gFetch<{ results?: RawService[] }>(`/bookings/${id}/services`),
    gFetch<{ results?: Json[] }>(`/bookings/${id}/invoices`),
    gFetch<{ results?: Json[] }>(`/bookings/${id}/payments`),
    gFetch<{ results?: Json[] }>(`/bookings/${id}/refunds`),
    gFetch<{ results?: Json[] }>(`/bookings/${id}/documents`),
    gFetch<{ results?: Json[] }>(`/bookings/${id}/checkins`),
  ]);
  if (!booking.ok || !booking.data) {
    return { ok: false, status: booking.status, error: booking.error };
  }
  return {
    ok: true,
    status: 200,
    booking: {
      id: String(booking.data.id ?? bookingId),
      externalId: booking.data.external_id ?? null,
      currency: booking.data.currency ?? null,
      amountPaid: booking.data.amount_paid != null ? Number(booking.data.amount_paid) : null,
      amountOwing: booking.data.amount_owing != null ? Number(booking.data.amount_owing) : null,
      balanceDueDate: booking.data.balance_due_date ?? null,
      firstTravel: booking.data.date_of_first_travel ?? null,
    },
    services: (services.data?.results ?? []).map((s) => normaliseService(s)).filter(Boolean),
    invoices: invoices.data?.results ?? [],
    payments: payments.data?.results ?? [],
    refunds: refunds.data?.results ?? [],
    documents: documents.data?.results ?? [],
    checkins: checkins.data?.results ?? [],
  };
}

/** Full requirement reference for a code surfaced on a service. */
export async function getTourRequirement(requirementId: string) {
  const res = await gFetch<Record<string, Json>>(
    `/requirements/${encodeURIComponent(requirementId)}`,
  );
  return { ok: res.ok, status: res.status, error: res.error, requirement: res.data ?? null };
}

/** Requirements published on the departure itself (read-only, pre-booking). */
export async function getDepartureRequirements(departureId: string) {
  const res = await gFetch<{
    requirements?: { type?: string; code?: string; name?: string; message?: string }[];
  }>(`/departures/${encodeURIComponent(departureId)}`);
  const rows = res.data?.requirements ?? [];
  return {
    ok: res.ok,
    status: res.status,
    error: res.error,
    confirmation: rows.filter((r) => r.type === "CONFIRMATION"),
    checkin: rows.filter((r) => r.type === "CHECKIN"),
    informational: rows.filter((r) => r.type === "INFORMATIONAL"),
  };
}

/** Cancellation penalty schedule for a departure (read-only). */
export async function getTourCancellationTerms(departureId: string) {
  const dep = await gFetch<{ cancellation_terms?: { id?: string } | null }>(
    `/departures/${encodeURIComponent(departureId)}`,
  );
  const termId = dep.data?.cancellation_terms?.id;
  if (!termId) {
    return { ok: dep.ok, status: dep.status, error: dep.error, terms: null };
  }
  const res = await gFetch<Record<string, Json>>(
    `/cancellation_terms/${encodeURIComponent(String(termId))}`,
  );
  return { ok: res.ok, status: res.status, error: res.error, terms: res.data ?? null };
}
