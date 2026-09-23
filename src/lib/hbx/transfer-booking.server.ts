// HBX Transfers — customer booking orchestration, persistence and the
// admin certification runner. Server-only.
//
// Safety rules:
//  * POST /bookings is sent exactly once per Worldway reference (idempotency
//    key + unique index; the HBX call itself is never retried).
//  * A booking whose outcome is unknown (timeout / network) is resolved from
//    the supplier booking list by clientReference — never re-submitted.
//  * The voucher is only issued once the supplier status is CONFIRMED.
import {
  cancelTransferBooking,
  createTransferBooking,
  fetchTransferAvailability,
  getTransferBooking,
  listTransferBookings,
} from "./transfers.server";
import {
  buildTransferVoucher,
  worldwayStatus,
  type TransferAvailabilityQuery,
  type TransferBookingInput,
  type TransferBookingRecord,
  type TransferOption,
  type TransferVoucher,
} from "./transfer-model";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export function newWorldwayTransferRef(): string {
  const r = crypto.getRandomValues(new Uint8Array(5));
  return `WWT${Array.from(r, (b) => b.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 9)}`;
}

/** Recover the outcome of a booking whose response was lost. */
export async function resolveByClientReference(clientReference: string): Promise<TransferBookingRecord | null> {
  const list = await listTransferBookings({ fromDate: plusDays(-1), toDate: plusDays(1), dateType: "CREATION_DATE" });
  const hit = list.data?.find((b) => b.clientReference === clientReference);
  if (!hit) return null;
  const detail = await getTransferBooking(hit.reference);
  return detail.data ?? null;
}

export interface CustomerBookingResult {
  ok: boolean;
  worldwayReference: string;
  bookingId: string | null;
  status: string;
  supplierReference: string | null;
  voucher: TransferVoucher | null;
  message: string;
}

export async function bookTransferForUser(
  userId: string,
  input: Omit<TransferBookingInput, "clientReference">,
  idempotencyKey: string,
  title: string,
  travelDate: string | null,
): Promise<CustomerBookingResult> {
  const sb = await db();
  const key = `hbx-transfers:${userId}:${idempotencyKey}`;

  const { data: existing } = await sb
    .from("bookings")
    .select("id,reference,status,supplier_reference,details")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    const details = (existing.details ?? {}) as { voucher?: TransferVoucher };
    return {
      ok: existing.status === "confirmed",
      worldwayReference: existing.reference,
      bookingId: existing.id,
      status: existing.status,
      supplierReference: existing.supplier_reference,
      voucher: details.voucher ?? null,
      message: "This booking was already submitted; showing its current status.",
    };
  }

  const reference = newWorldwayTransferRef();
  const { data: row, error: insErr } = await sb
    .from("bookings")
    .insert({
      user_id: userId,
      reference,
      product_type: "transfer",
      title: title.slice(0, 200),
      travel_date: travelDate,
      status: "pending",
      supplier: "hbx-transfers",
      supplier_status: "submitting",
      currency: "EUR",
      idempotency_key: key,
      details: { legs: input.legs.map((l) => ({ direction: l.direction, transport: `${l.transportType} ${l.transportCode}` })) },
    } as never)
    .select("id")
    .single();
  if (insErr || !row) {
    return { ok: false, worldwayReference: reference, bookingId: null, status: "failed", supplierReference: null, voucher: null, message: "We could not start this booking. Please try again." };
  }

  const res = await createTransferBooking({ ...input, clientReference: reference });
  let booking = res.data?.booking ?? null;
  if (!res.ok && (res.status === 0 || res.status >= 500)) {
    // Outcome unknown: resolve from the supplier, never re-submit.
    booking = await resolveByClientReference(reference);
  }

  if (!booking) {
    const unknown = !res.ok && (res.status === 0 || res.status >= 500);
    await sb
      .from("bookings")
      .update({
        status: unknown ? "pending" : "failed",
        supplier_status: unknown ? "unknown" : "rejected",
        details: { error: res.error?.code ?? "supplier-error" },
      } as never)
      .eq("id", row.id);
    return {
      ok: false,
      worldwayReference: reference,
      bookingId: row.id,
      status: unknown ? "pending" : "failed",
      supplierReference: null,
      voucher: null,
      message: unknown
        ? "The transfer operator has not confirmed yet. Our team will verify and contact you — do not rebook."
        : "This transfer is no longer available at that price. Please search again.",
    };
  }

  const voucher = buildTransferVoucher(booking, reference);
  const status = worldwayStatus(booking.status);
  await sb
    .from("bookings")
    .update({
      status,
      supplier_reference: booking.reference,
      supplier_status: booking.status,
      amount: booking.totalAmount,
      currency: booking.currency || "EUR",
      balance_due: booking.totalAmount,
      details: { booking, voucher },
    } as never)
    .eq("id", row.id);
  if (voucher) {
    await sb.from("booking_documents").insert({
      booking_id: row.id,
      user_id: userId,
      doc_type: "voucher",
      title: `Transfer voucher ${reference}`,
      reference: booking.reference,
      content: voucher,
    } as never);
  }
  return {
    ok: status === "confirmed",
    worldwayReference: reference,
    bookingId: row.id,
    status,
    supplierReference: booking.reference,
    voucher,
    message: status === "confirmed" ? "Transfer confirmed." : "Transfer submitted — awaiting confirmation.",
  };
}

export async function cancelTransferForUser(userId: string, worldwayReference: string) {
  const sb = await db();
  const { data: b } = await sb
    .from("bookings")
    .select("id,user_id,supplier_reference,status,details")
    .eq("reference", worldwayReference)
    .eq("supplier", "hbx-transfers")
    .maybeSingle();
  if (!b || b.user_id !== userId) throw new Error("Booking not found.");
  if (!b.supplier_reference) throw new Error("This booking has no confirmed transfer to cancel.");
  let res = await cancelTransferBooking(b.supplier_reference);
  let record = res.data ?? null;
  if (!res.ok) {
    // Re-read the authoritative state rather than retrying the DELETE.
    const d = await getTransferBooking(b.supplier_reference);
    record = d.data ?? null;
    res = d;
  }
  if (!record) throw new Error("We could not confirm the cancellation. Our team has been notified.");
  const status = worldwayStatus(record.status);
  await sb
    .from("bookings")
    .update({
      status,
      supplier_status: record.status,
      cancellation_reason: status === "cancelled" ? "Cancelled by customer" : null,
      details: { ...((b.details ?? {}) as object), booking: record },
    } as never)
    .eq("id", b.id);
  return { status, supplierStatus: record.status };
}

// ------------------------------------------------------ certification

export interface CertStep {
  step: string;
  ok: boolean;
  httpStatus: number | null;
  detail: string;
  /** JSON-encoded sanitized supplier evidence. */
  evidence?: string;
}

export interface CertScenario {
  id: string;
  title: string;
  passed: boolean;
  steps: CertStep[];
  bookingReferences: string[];
  vouchers: TransferVoucher[];
}

function pick(options: TransferOption[], pref: (o: TransferOption) => boolean): TransferOption | undefined {
  return options.find(pref) ?? options[0];
}

async function availabilityStep(steps: CertStep[], label: string, q: TransferAvailabilityQuery) {
  const res = await fetchTransferAvailability(q);
  const data = res.data;
  const count = (data?.outbound.length ?? 0) + (data?.inbound.length ?? 0);
  steps.push({
    step: label,
    ok: res.ok && count > 0,
    httpStatus: res.status,
    detail: res.ok ? `${data?.outbound.length ?? 0} outbound / ${data?.inbound.length ?? 0} return services` : `${res.error?.code}: ${res.error?.detail ?? res.error?.message}`,
    evidence: data
      ? JSON.stringify({
          search: data.search,
          sample: [...data.outbound, ...data.inbound].slice(0, 3).map((o) => ({
            direction: o.direction,
            type: o.transferType,
            vehicle: o.vehicle.name,
            category: o.category.name,
            price: o.price,
            images: o.images.length,
            remarks: o.remarks.length,
            details: o.details.map((d) => `${d.id}=${d.value}`),
            checkPickup: o.pickup.checkPickup,
            pickupTime: o.pickup.time,
            cancellationPolicies: o.cancellationPolicies,
            extras: o.extras.map((e) => `${e.code}:${e.name}:${e.amount}`),
          })),
        })
      : undefined,
  });
  return data;
}

async function bookVoucherCancel(
  sc: CertScenario,
  input: TransferBookingInput,
  cancel: boolean,
  expect?: (b: TransferBookingRecord) => string | null,
) {
  const res = await createTransferBooking(input);
  const booking = res.data?.booking ?? null;
  sc.steps.push({
    step: "Booking (POST /bookings)",
    ok: res.ok && booking?.status === "CONFIRMED",
    httpStatus: res.status,
    detail: booking ? `reference ${booking.reference} status ${booking.status} total ${booking.totalAmount} ${booking.currency}` : `${res.error?.code}: ${res.error?.detail ?? res.error?.message}`,
    evidence: booking
      ? JSON.stringify({
          reference: booking.reference,
          clientReference: booking.clientReference,
          holder: `${booking.holder.name} ${booking.holder.surname}`,
          transfers: booking.transfers.map((t) => ({
            direction: t.direction,
            status: t.status,
            transferDetails: t.transferDetails,
            extras: t.extras,
            paxes: t.paxes,
            pickupTime: t.pickup.time,
            checkPickup: t.pickup.checkPickup,
          })),
        })
      : undefined,
  });
  if (!booking) return;
  sc.bookingReferences.push(booking.reference);
  if (expect) {
    const problem = expect(booking);
    sc.steps.push({ step: "Scenario-specific checks", ok: !problem, httpStatus: null, detail: problem ?? "All scenario conditions present in the confirmed booking." });
  }

  const detail = await getTransferBooking(booking.reference);
  sc.steps.push({
    step: "Booking detail (GET /bookings/{lang}/reference/{ref})",
    ok: detail.ok && detail.data?.reference === booking.reference,
    httpStatus: detail.status,
    detail: detail.data ? `status ${detail.data.status}` : `${detail.error?.code}`,
  });

  const voucher = buildTransferVoucher(detail.data ?? booking, input.clientReference);
  sc.steps.push({
    step: "Voucher generated from confirmed booking",
    ok: Boolean(voucher),
    httpStatus: null,
    detail: voucher ? `${voucher.legs.length} leg(s); ${voucher.payableStatement}` : "No voucher — booking not confirmed.",
  });
  if (voucher) sc.vouchers.push(voucher);

  if (cancel) {
    const c = await cancelTransferBooking(booking.reference);
    sc.steps.push({
      step: "Cancellation (DELETE /bookings/{lang}/reference/{ref})",
      ok: c.ok && c.data?.status === "CANCELLED",
      httpStatus: c.status,
      detail: c.data ? `status ${c.data.status}` : `${c.error?.code}: ${c.error?.detail ?? c.error?.message}`,
    });
  }
}

const HOLDER = { name: "Certification", surname: "Worldway", email: "reservations@worldwaytravelsgroup.com", phone: "+34600000000" };

/** Runs Federico's four HBX TEST certification scenarios plus checklist extras.
 *  Refuses to run against the live environment. */
export async function runTransferCertification(opts: { date?: string; only?: string[] } = {}): Promise<{
  environment: string;
  scenarios: CertScenario[];
  additional: CertStep[];
}> {
  const { hbxEnvironment } = await import("./client.server");
  const environment = hbxEnvironment();
  if (environment !== "test") throw new Error("Transfer certification only runs against HBX TEST.");
  const base = opts.date ?? plusDays(45);
  const back = new Date(new Date(base).getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const scenarios: CertScenario[] = [];
  const mk = (id: string, title: string): CertScenario => ({ id, title, passed: false, steps: [], bookingReferences: [], vouchers: [] });

  const want = (id: string) => !opts.only?.length || opts.only.includes(id);
  // 1. Sistina 5643 → CIA with mustCheckPickupTime
  if (want("1")) {
    const sc = mk("1", "Sistina (ATLAS 5643) → Rome Ciampino (IATA CIA), mustCheckPickupTime");
    const av = await availabilityStep(sc.steps, "Availability", {
      from: { type: "ATLAS", code: "5643" }, to: { type: "IATA", code: "CIA" }, outbound: `${base}T10:00`, adults: 2, children: 0, infants: 0,
    });
    const opt = av && pick(av.outbound, (o) => o.pickup.checkPickup?.mustCheckPickupTime === true);
    sc.steps.push({
      step: "mustCheckPickupTime=true present",
      ok: Boolean(opt?.pickup.checkPickup?.mustCheckPickupTime),
      httpStatus: null,
      detail: opt ? `checkPickup ${JSON.stringify(opt.pickup.checkPickup)}` : "no service",
    });
    if (opt) {
      await bookVoucherCancel(sc, {
        holder: HOLDER, clientReference: newWorldwayTransferRef(), remark: "Certification scenario 1",
        legs: [{ rateKey: opt.rateKey, direction: "DEPARTURE", transportType: "FLIGHT", transportCode: "FR1234" }],
      }, true, (b) => (b.transfers[0]?.pickup.checkPickup?.mustCheckPickupTime ? null : "Confirmed booking does not carry checkPickup."));
    }
    scenarios.push(sc);
  }

  // 2. Barcelona Universal 57 → PORT 277, separate IN/OUT
  if (want("2")) {
    const sc = mk("2", "Barcelona Universal (ATLAS 57) ↔ Port (PORT 277), separate IN and OUT");
    const out = await availabilityStep(sc.steps, "Availability OUT (hotel → port)", {
      from: { type: "ATLAS", code: "57" }, to: { type: "PORT", code: "277" }, outbound: `${base}T10:00`, adults: 2, children: 0, infants: 0,
    });
    const inn = await availabilityStep(sc.steps, "Availability IN (port → hotel)", {
      from: { type: "PORT", code: "277" }, to: { type: "ATLAS", code: "57" }, outbound: `${back}T09:00`, adults: 2, children: 0, infants: 0,
    });
    const o1 = out && pick(out.outbound, (o) => o.transferType === "PRIVATE");
    const o2 = inn && pick(inn.outbound, (o) => o.transferType === "PRIVATE");
    if (o1 && o2) {
      await bookVoucherCancel(sc, {
        holder: HOLDER, clientReference: newWorldwayTransferRef(), remark: "Certification scenario 2",
        legs: [
          { rateKey: o1.rateKey, direction: "DEPARTURE", transportType: "CRUISE", transportCode: "MSC WORLD", companyName: "MSC" },
          { rateKey: o2.rateKey, direction: "ARRIVAL", transportType: "CRUISE", transportCode: "MSC WORLD", companyName: "MSC" },
        ],
      }, true, (b) => (b.transfers.length === 2 ? null : `Expected 2 transfers, got ${b.transfers.length}.`));
    }
    scenarios.push(sc);
  }

  // 3. Hilton Barcelona 651 → STATION 930 (no cancel)
  if (want("3")) {
    const sc = mk("3", "Hilton Barcelona (ATLAS 651) → Station (STATION 930)");
    const av = await availabilityStep(sc.steps, "Availability", {
      from: { type: "ATLAS", code: "651" }, to: { type: "STATION", code: "930" }, outbound: `${base}T11:00`, adults: 2, children: 0, infants: 0,
    });
    const opt = av && pick(av.outbound, () => true);
    if (opt) {
      await bookVoucherCancel(sc, {
        holder: HOLDER, clientReference: newWorldwayTransferRef(), remark: "Certification scenario 3",
        legs: [{ rateKey: opt.rateKey, direction: "DEPARTURE", transportType: "TRAIN", transportCode: "AVE3100", companyName: "Renfe" }],
      }, false);
    }
    scenarios.push(sc);
  }

  // 4. Barcelona Universal 57 → BCN with optional extra
  if (want("4")) {
    const sc = mk("4", "Barcelona Universal (ATLAS 57) → Barcelona Airport (IATA BCN) with optional extra");
    const av = await availabilityStep(sc.steps, "Availability", {
      from: { type: "ATLAS", code: "57" }, to: { type: "IATA", code: "BCN" }, outbound: `${base}T12:00`, adults: 2, children: 0, infants: 0,
    });
    const opt = av && pick(av.outbound, (o) => o.extras.some((e) => e.amount > 0));
    const extra = opt?.extras.find((e) => e.amount > 0) ?? opt?.extras[0];
    sc.steps.push({ step: "Optional extra offered", ok: Boolean(extra), httpStatus: null, detail: extra ? `${extra.code} ${extra.name} ${extra.amount}` : "no extras returned" });
    if (opt && extra) {
      await bookVoucherCancel(sc, {
        holder: HOLDER, clientReference: newWorldwayTransferRef(), remark: "Certification scenario 4",
        legs: [{ rateKey: opt.rateKey, direction: "DEPARTURE", transportType: "FLIGHT", transportCode: "VY1234", extras: [{ code: extra.code, units: 1 }] }],
      }, true, (b) => (b.transfers[0]?.extras.some((e) => e.code === extra.code) ? null : "Selected extra missing from the confirmed booking."));
    }
    scenarios.push(sc);
  }

  for (const sc of scenarios) sc.passed = sc.steps.length > 0 && sc.steps.every((s) => s.ok);

  // Additional checklist tests
  const additional: CertStep[] = [];
  if (opts.only?.length) return { environment, scenarios, additional };
  await availabilityStep(additional, "GPS search (GPS 41.3851,2.1734 → IATA BCN)", {
    from: { type: "GPS", code: "41.3851,2.1734" }, to: { type: "IATA", code: "BCN" }, outbound: `${base}T10:00`, adults: 2, children: 0, infants: 0,
  });
  const kids = await availabilityStep(additional, "Children/infants search (2 adults, 1 child, 1 infant)", {
    from: { type: "IATA", code: "BCN" }, to: { type: "ATLAS", code: "57" }, outbound: `${base}T10:00`, adults: 2, children: 1, infants: 1,
  });
  if (kids) {
    const occ = kids.search.occupancy;
    additional.push({ step: "Occupancy echoed by HBX", ok: occ.children === 1 && occ.infants === 1, httpStatus: null, detail: JSON.stringify(occ) });
  }
  const rt = await availabilityStep(additional, "Round-trip search (BCN ↔ ATLAS 57)", {
    from: { type: "IATA", code: "BCN" }, to: { type: "ATLAS", code: "57" }, outbound: `${base}T10:00`, inbound: `${back}T18:00`, adults: 2, children: 0, infants: 0,
  });
  if (rt) additional.push({ step: "Round trip returns both legs", ok: rt.outbound.length > 0 && rt.inbound.length > 0, httpStatus: null, detail: `${rt.outbound.length} out / ${rt.inbound.length} return` });
  const any = rt?.outbound[0];
  if (any) {
    const p = any.cancellationPolicies[0];
    additional.push({
      step: "Cancellation policy timing (destination local time + UTC offset)",
      ok: Boolean(p && p.from && p.utcOffset && p.fromUtc),
      httpStatus: null,
      detail: p ? `from ${p.from} (${p.utcOffset}) = ${p.fromUtc} UTC, ${p.amount} ${p.currency}` : "no policy returned",
    });
  }
  const list = await listTransferBookings({ fromDate: today(), toDate: plusDays(1), dateType: "CREATION_DATE" });
  const certRefs = scenarios.flatMap((s) => s.bookingReferences);
  const found = certRefs.filter((r) => list.data?.some((b) => b.reference === r));
  additional.push({
    step: "Booking list (GET /bookings/{lang}?fromDate&toDate&dateType)",
    ok: list.ok && found.length === certRefs.length && certRefs.length > 0,
    httpStatus: list.status,
    detail: `${list.data?.length ?? 0} bookings listed; ${found.length}/${certRefs.length} certification bookings found`,
  });
  return { environment, scenarios, additional };
}
