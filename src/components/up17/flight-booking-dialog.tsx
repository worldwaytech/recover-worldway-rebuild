import { useMemo, useState } from "react";

type Extra = { key: string; kind: "baggage" | "meal" | "seat"; label: string; sector: string; price: number; currency: string };
type Sel = { baggage: Record<string, string>; meal: Record<string, string>; seat: Record<string, string> };
const blankSel = (): Sel => ({ baggage: {}, meal: {}, seat: {} });
import { useServerFn } from "@tanstack/react-start";
import {
  up17ConfirmFlightFare,
  up17BookFlightTicket,
  up17FlightBookingLookup,
  up17FlightExtrasLookup,
} from "@/lib/up17/up17.functions";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";


type PaxType = 1 | 2 | 3;

type PaxForm = {
  title: "Mr" | "Mrs" | "Ms" | "Dr" | "Mstr" | "Miss";
  first_name: string;
  last_name: string;
  pax_type: PaxType;
  date_of_birth: string;
  gender: 1 | 2;
  nationality: string;
  address_line1: string;
  city: string;
  country_code: string;
  contact_no: string;
  email: string;
  is_lead: boolean;
  passport_no?: string;
  passport_expiry?: string;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-foreground";
const labelCls = "block text-[10px] uppercase tracking-[0.25em] text-muted-foreground";

function money(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function blankPax(lead: boolean, type: PaxType = 1): PaxForm {
  return {
    title: "Mr",
    first_name: "",
    last_name: "",
    pax_type: type,
    date_of_birth: "",
    gender: 1,
    nationality: "IN",
    address_line1: "",
    city: "",
    country_code: "IN",
    contact_no: "",
    email: "",
    is_lead: lead,
  };
}

export function FlightBookingDialog({
  open,
  onClose,
  resultIndex,
  searchTokenId,
  currency,
  total,
  summary,
  passengerCount,
}: {
  open: boolean;
  onClose: () => void;
  resultIndex: string;
  searchTokenId: string | null;
  currency: string;
  total: number | null;
  summary: string;
  passengerCount: number;
}) {
  const confirmFare = useServerFn(up17ConfirmFlightFare);
  const bookTicket = useServerFn(up17BookFlightTicket);
  const lookupBooking = useServerFn(up17FlightBookingLookup);
  const lookupExtras = useServerFn(up17FlightExtrasLookup);
  const [extras, setExtras] = useState<Extra[] | null>(null);
  const [extrasNote, setExtrasNote] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel[]>([]);
  const { pay, busy: paying, error: payError, setError: setPayError } = useRazorpayCheckout();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Record<string, unknown> | null>(null);
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [payment, setPayment] = useState<{ paymentId: string; orderId: string } | null>(null);


  const [pax, setPax] = useState<PaxForm[]>(() =>
    Array.from({ length: Math.max(1, passengerCount) }, (_, i) => blankPax(i === 0)),
  );

  const fareTotal = useMemo(() => {
    const c = confirmation as { total?: number | null; fare?: { total?: number | null } } | null;
    return c?.total ?? c?.fare?.total ?? total;
  }, [confirmation, total]);
  const extrasTotal = useMemo(() => {
    const price = new Map((extras ?? []).map((e) => [e.key, e.price]));
    return sel.reduce(
      (sum, s) => sum + [s.baggage, s.meal, s.seat].flatMap((m) => Object.values(m)).reduce((a, k) => a + (price.get(k) ?? 0), 0),
      0,
    );
  }, [extras, sel]);
  const confirmedTotal = fareTotal === null || fareTotal === undefined ? fareTotal : fareTotal + extrasTotal;
  const selections = pax.map((_, i) => {
    const s = sel[i] ?? blankSel();
    return { baggage: Object.values(s.baggage), meal: Object.values(s.meal), seat: Object.values(s.seat) };
  });
  const sectors = useMemo(() => Array.from(new Set((extras ?? []).map((e) => e.sector))), [extras]);
  const takenSeats = new Set(sel.flatMap((s) => Object.values(s.seat)));

  function pick(i: number, kind: keyof Sel, sector: string, key: string) {
    setSel((prev) => {
      const next = pax.map((_, idx) => prev[idx] ?? blankSel());
      const cur = { ...next[i]![kind] };
      if (key) cur[sector] = key;
      else delete cur[sector];
      next[i] = { ...next[i]!, [kind]: cur };
      return next;
    });
  }

  async function loadExtras() {
    if (!searchTokenId) return;
    try {
      const res = await lookupExtras({ data: { resultIndex, searchTokenId } });
      setExtras(res.extras as Extra[]);
      if (!res.ok) setExtrasNote("Seats, meals and extra baggage aren't available online for this fare.");
      else if (!res.extras.length) setExtrasNote("The airline offers no paid extras for this fare.");
    } catch {
      setExtras([]);
      setExtrasNote("Seats, meals and extra baggage aren't available online for this fare.");
    }
  }

  function patch(i: number, p: Partial<PaxForm>) {
    setPax((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  }

  async function runConfirm() {
    if (!searchTokenId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmFare({ data: { resultIndex, searchTokenId } });
      if (!res.ok) setError(res.error ?? "Fare could not be confirmed. Please search again.");
      else {
        setConfirmation((res.confirmation ?? {}) as Record<string, unknown>);
        setStep(2);
        void loadExtras();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fare confirmation failed");
    } finally {
      setBusy(false);
    }
  }

  function validate(): string | null {
    for (const [i, p] of pax.entries()) {
      const who = `Traveller ${i + 1}`;
      if (!p.first_name.trim() || !p.last_name.trim()) return `${who}: full name is required.`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)) return `${who}: date of birth is required.`;
      if (p.nationality.trim().length !== 2) return `${who}: nationality must be a 2-letter code.`;
      if (!p.address_line1.trim() || !p.city.trim()) return `${who}: address and city are required.`;
      if (p.contact_no.trim().length < 6) return `${who}: a contact number is required.`;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim())) return `${who}: a valid email is required.`;
    }
    return null;
  }

  /** Collects payment through Razorpay, then requests the ticket only once capture is verified. */
  async function runPayAndBook() {
    if (!searchTokenId || !confirmedTotal) return;
    setError(null);
    setPayError(null);
    const lead = pax[0];
    const result = await pay({
      purpose: "flight",
      amount: confirmedTotal,
      currency: currency || "INR",
      description: `Flight · ${summary}`,
      flightFare: { resultIndex, searchTokenId, ...(extrasTotal > 0 || selections.some((s) => s.seat.length) ? { extras: selections } : {}) },
      ...(lead ? { name: `${lead.first_name} ${lead.last_name}`.trim() } : {}),
      ...(lead?.email ? { email: lead.email.trim() } : {}),
      ...(lead?.contact_no ? { phone: lead.contact_no.trim() } : {}),
      reference: {
        module: "up17_flight",
        result_index: resultIndex,
        travellers: pax.length,
        summary,
      },
    });
    if (!result) return;
    setPayment({ paymentId: result.paymentId, orderId: result.orderId });
    await runBook({ orderId: result.orderId, paymentId: result.paymentId });
  }

  /** Requests the ticket. Requires a verified payment — the server re-checks it. */
  async function runBook(paid: { orderId: string; paymentId: string }) {
    if (!searchTokenId) return;
    setBusy(true);
    setError(null);
    try {
      const payload = pax.map((p) => ({
        ...p,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        email: p.email.trim(),
        nationality: p.nationality.trim().toUpperCase(),
        country_code: p.country_code.trim().toUpperCase(),
        ...(p.passport_no?.trim() ? { passport_no: p.passport_no.trim() } : {}),
        ...(p.passport_expiry ? { passport_expiry: p.passport_expiry } : {}),
      }));
      const res = (await bookTicket({
        data: {
          resultIndex,
          searchTokenId,
          passengers: payload.map((p, i) => ({ ...p, extras: selections[i] ?? {} })),
          orderId: paid.orderId,
          paymentId: paid.paymentId,
        },
      })) as { ok: boolean; error?: string | undefined; booking: unknown };
      if (!res.ok || !res.booking) {

        const base = res.error ?? "The airline declined this booking. No ticket was issued.";
        setError(
          payment
            ? `${base} Your payment (${payment.paymentId}) is on file and will be refunded in full — our team has been notified.`
            : base,
        );
        return;

      }
      setBooking(res.booking as Record<string, unknown>);
      setStep(4);
      const b = res.booking as { bookingId?: string; pnr?: string };
      try {
        const detail = await lookupBooking({
          data: {
            searchTokenId,
            orderId: paid.orderId,
            paymentId: paid.paymentId,
            ...(b.bookingId ? { bookingId: String(b.bookingId) } : {}),
            ...(b.pnr ? { pnr: String(b.pnr) } : {}),
          },
        });
        if (detail.ok && detail.booking) setBooking(detail.booking as Record<string, unknown>);
      } catch {
        /* confirmation already captured */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const bk = (booking ?? {}) as { pnr?: string; bookingId?: string; status?: string };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Flight booking · Step {step} of 4
            </div>
            <h2 className="mt-1 font-serif text-xl text-foreground">{summary}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              We re-price this fare directly with the airline before collecting any details, so the
              amount you see is the amount payable.
            </p>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quoted total</span>
                <span className="font-serif text-lg">{money(total, currency)}</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {passengerCount} traveller{passengerCount > 1 ? "s" : ""} · incl. taxes
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !searchTokenId}
              onClick={runConfirm}
              className="rounded-full bg-primary px-6 py-2.5 text-[11px] uppercase tracking-[0.25em] text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Confirming fare…" : "Confirm fare with airline"}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 space-y-6">
            {confirmedTotal !== total ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600">
                The airline re-priced this fare to {money(confirmedTotal, currency)}.
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-600">
                Fare confirmed at {money(confirmedTotal, currency)} — no price change.
              </div>
            )}

            {pax.map((p, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Traveller {i + 1}
                  {p.is_lead ? " · lead passenger" : ""}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label>
                    <span className={labelCls}>Title</span>
                    <select
                      value={p.title}
                      onChange={(e) => patch(i, { title: e.target.value as PaxForm["title"] })}
                      className={inputCls}
                    >
                      {["Mr", "Mrs", "Ms", "Miss", "Dr", "Mstr"].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelCls}>First name</span>
                    <input
                      value={p.first_name}
                      onChange={(e) => patch(i, { first_name: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Last name</span>
                    <input
                      value={p.last_name}
                      onChange={(e) => patch(i, { last_name: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Date of birth</span>
                    <input
                      type="date"
                      value={p.date_of_birth}
                      onChange={(e) => patch(i, { date_of_birth: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Gender</span>
                    <select
                      value={p.gender}
                      onChange={(e) => patch(i, { gender: Number(e.target.value) === 2 ? 2 : 1 })}
                      className={inputCls}
                    >
                      <option value={1}>Male</option>
                      <option value={2}>Female</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelCls}>Passenger type</span>
                    <select
                      value={p.pax_type}
                      onChange={(e) => patch(i, { pax_type: Number(e.target.value) as PaxType })}
                      className={inputCls}
                    >
                      <option value={1}>Adult</option>
                      <option value={2}>Child</option>
                      <option value={3}>Infant</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelCls}>Nationality (2-letter)</span>
                    <input
                      value={p.nationality}
                      maxLength={2}
                      onChange={(e) => patch(i, { nationality: e.target.value.toUpperCase() })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Country (2-letter)</span>
                    <input
                      value={p.country_code}
                      maxLength={2}
                      onChange={(e) => patch(i, { country_code: e.target.value.toUpperCase() })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>City</span>
                    <input
                      value={p.city}
                      onChange={(e) => patch(i, { city: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="md:col-span-3">
                    <span className={labelCls}>Address</span>
                    <input
                      value={p.address_line1}
                      onChange={(e) => patch(i, { address_line1: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Contact number</span>
                    <input
                      value={p.contact_no}
                      onChange={(e) => patch(i, { contact_no: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className={labelCls}>Email</span>
                    <input
                      type="email"
                      value={p.email}
                      onChange={(e) => patch(i, { email: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Passport no. (optional)</span>
                    <input
                      value={p.passport_no ?? ""}
                      onChange={(e) => patch(i, { passport_no: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label>
                    <span className={labelCls}>Passport expiry (optional)</span>
                    <input
                      type="date"
                      value={p.passport_expiry ?? ""}
                      onChange={(e) => patch(i, { passport_expiry: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className={labelCls}>Seats, meals &amp; extra baggage</div>
              {extras === null ? (
                <p className="mt-2 text-xs text-muted-foreground">Loading live options from the airline…</p>
              ) : extrasNote ? (
                <p className="mt-2 text-xs text-muted-foreground">{extrasNote}</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {pax.map((p, i) => (
                    <div key={i} className="space-y-2">
                      <div className="text-xs text-foreground">
                        Traveller {i + 1}{p.first_name ? ` · ${p.first_name} ${p.last_name}` : ""}
                      </div>
                      {sectors.map((sector) => (
                        <div key={sector} className="grid gap-2 sm:grid-cols-3">
                          {(["seat", "meal", "baggage"] as const).map((kind) => {
                            const opts = (extras ?? []).filter((e) => e.kind === kind && e.sector === sector);
                            if (!opts.length) return null;
                            const value = sel[i]?.[kind][sector] ?? "";
                            return (
                              <label key={kind}>
                                <span className={labelCls}>{kind === "baggage" ? "Extra bag" : kind} · {sector}</span>
                                <select value={value} onChange={(e) => pick(i, kind, sector, e.target.value)} className={inputCls}>
                                  <option value="">{kind === "seat" ? "Auto-assigned at check-in" : "None"}</option>
                                  {opts
                                    .filter((o) => kind !== "seat" || o.key === value || !takenSeats.has(o.key))
                                    .map((o) => (
                                      <option key={o.key} value={o.key}>
                                        {o.label} — {o.price > 0 ? money(o.price, o.currency) : "Free"}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                  {extrasTotal > 0 ? (
                    <div className="text-xs text-muted-foreground">Extras total: {money(extrasTotal, currency)} · re-verified with the airline at payment</div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={() => setPax((prev) => [...prev, blankPax(false)])}
                disabled={pax.length >= 9}
                className="rounded-full border border-border px-5 py-2.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Add traveller
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = validate();
                  if (v) setError(v);
                  else {
                    setError(null);
                    setStep(3);
                  }
                }}
                className="rounded-full bg-primary px-6 py-2.5 text-[11px] uppercase tracking-[0.25em] text-primary-foreground"
              >
                Continue to payment
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Amount payable{extrasTotal > 0 ? ` (fare ${money(fareTotal, currency)} + extras ${money(extrasTotal, currency)})` : ""}</span>
                <span className="font-serif text-xl">{money(confirmedTotal, currency)}</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {pax.length} traveller{pax.length > 1 ? "s" : ""} · {summary}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-600">
              Payment is collected before the ticket is requested. Once we submit the booking the
              airline issues the ticket immediately and the fare becomes subject to its cancellation
              rules — there is no free hold.
            </div>

            {payment ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-600">
                Payment captured · {payment.paymentId}. Issuing your ticket…
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                You will be taken to our secure Razorpay checkout. Cards, UPI, net banking and
                wallets are accepted. The ticket is requested the moment payment is confirmed.
              </p>
            )}

            {payError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
                {payError}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-full border border-border px-5 py-2.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
              >
                Back to travellers
              </button>
              <button
                type="button"
                disabled={busy || paying || !confirmedTotal}
                onClick={runPayAndBook}
                className="rounded-full bg-primary px-6 py-2.5 text-[11px] uppercase tracking-[0.25em] text-primary-foreground disabled:opacity-50"
              >
                {paying
                  ? "Awaiting payment…"
                  : busy
                    ? "Issuing ticket…"
                    : `Pay ${money(confirmedTotal, currency)} & issue ticket`}
              </button>
            </div>
          </div>
        ) : null}


        {step === 4 ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-600">
              Ticket issued. Your booking is confirmed with the airline.
            </div>
            <dl className="grid gap-3 rounded-xl border border-border/60 bg-background/40 p-4 text-xs md:grid-cols-3">
              <div>
                <dt className={labelCls}>PNR</dt>
                <dd className="mt-1 text-sm text-foreground">{bk.pnr ?? "—"}</dd>
              </div>
              <div>
                <dt className={labelCls}>Booking reference</dt>
                <dd className="mt-1 text-sm text-foreground">{bk.bookingId ?? "—"}</dd>
              </div>
              <div>
                <dt className={labelCls}>Status</dt>
                <dd className="mt-1 text-sm text-foreground">{bk.status ?? "Confirmed"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Ticket details for {pax.map((p) => `${p.first_name} ${p.last_name}`.trim()).join(", ")}{" "}
              have been sent to {pax[0]?.email}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-6 py-2.5 text-[11px] uppercase tracking-[0.25em] text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
