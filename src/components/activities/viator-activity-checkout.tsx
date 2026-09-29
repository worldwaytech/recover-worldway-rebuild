/**
 * Viator Activities hosted payment iFrame checkout.
 *
 * Only used when the cart is exclusively Viator Activities (the server
 * re-verifies this). Card data is entered inside Viator's own iFrame and never
 * touches Worldway — we only receive a paymentToken which the server exchanges
 * at bookings/cart/book.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  bookViatorActivityCart,
  holdViatorActivityCart,
  viatorActivityBookingStatus,
} from "@/lib/viator/activities-checkout.functions";
import {
  VIATOR_PAYMENT_SCRIPT_URL,
  type ActivityBookingState,
  type PaxMix,
} from "@/lib/viator/checkout-contract";
import { getViatorBookingQuestions } from "@/lib/viator.functions";
import { logViatorCheckoutEvent } from "@/lib/viator/diagnostics.functions";
import {
  LOCATION_REFERENCE_UNIT,
  FREETEXT_UNIT,
  groupBookingQuestions,
  type BookingQuestion,
  type BookingQuestionAnswer,
} from "@/lib/viator/booking-questions";
import type { AgeBandRule } from "@/lib/viator/age-bands";

type PaymentHandler = {
  submit: (
    cardMetadata: { address: { country: string; postalCode: string }; email?: string },
    options?: Record<string, unknown>,
  ) => Promise<{ paymentToken: string }>;
  unload?: () => void;
};

type RenderOpts = {
  /** Element ID (payment.js calls document.getElementById on it). */
  cardElementContainer: string;
  onFormUpdate?: (e: { eventType: string; formValid?: boolean }) => void;
};

type PaymentInstance = {
  renderCard?: (opts: RenderOpts) => PaymentHandler;
  renderCheckout: (opts: RenderOpts) => PaymentHandler;
  destruct?: () => void;
};

const CARD_CONTAINER_ID = "viator-card-frame-holder";

declare global {
  interface Window {
    Payment?: {
      init: (token: string) => PaymentInstance;
      instance?: PaymentInstance;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadPaymentScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Payment) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = VIATOR_PAYMENT_SCRIPT_URL;
    el.type = "module";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the secure payment form."));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export type ActivityCheckoutMode = "pay_now" | "pay_later";

export type ActivityCheckoutProps = {
  productCode: string;
  productTitle: string;
  travelDate: string;
  currency: string;
  paxMix: PaxMix;
  productOptionCode?: string;
  startTime?: string;
  languageGuide?: { type: string; language: string };
  ageBands?: AgeBandRule[];
  /** Live total already quoted on the product page, for display continuity. */
  quotedTotal?: number;
  booker: { firstName: string; lastName: string; email: string; phone?: string };
  /**
   * pay_now   — hold, then immediately present the card form.
   * pay_later — hold first; the guest reviews the supplier hold window and
   *             opens the card form when ready (must pay before the hold lapses).
   */
  mode?: ActivityCheckoutMode;
  onClose: () => void;
};

function formatHoldExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ViatorActivityCheckout(props: ActivityCheckoutProps) {
  const mode: ActivityCheckoutMode = props.mode ?? "pay_now";
  const hold = useServerFn(holdViatorActivityCart);
  const book = useServerFn(bookViatorActivityCart);
  const poll = useServerFn(viatorActivityBookingStatus);
  const logEvent = useServerFn(logViatorCheckoutEvent);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlerRef = useRef<PaymentHandler | null>(null);

  const [phase, setPhase] = useState<"holding" | "held" | "paying" | "booking" | "done">(
    "holding",
  );
  const [error, setError] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [, setFormLoaded] = useState(false);
  const [session, setSession] = useState<{
    cartRef: string;
    accessToken: string;
    token: string;
    total: number;
    currency: string;
    holdExpiresAt: string | null;
    sessionExpiresAt: string | null;
  } | null>(null);
  const [billing, setBilling] = useState({ country: "US", postalCode: "" });
  const travellerCount = props.paxMix.reduce((sum, p) => sum + p.count, 0);
  const loadQuestions = useServerFn(getViatorBookingQuestions);
  const [questions, setQuestions] = useState<BookingQuestion[]>([]);
  const [pickupInfo, setPickupInfo] = useState<{
    pickupOptionType: string | null;
    allowCustomTravelerPickup: boolean;
    additionalInfo: string | null;
    locations: { reference: string; name: string | null; address: string | null }[];
  } | null>(null);
  /** answers keyed `${questionId}#${travelerNum}` (0 = per-booking). */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [travellerNames, setTravellerNames] = useState<
    { firstName: string; lastName: string }[]
  >(() =>
    Array.from({ length: travellerCount }, (_, i) =>
      i === 0
        ? { firstName: props.booker.firstName, lastName: props.booker.lastName }
        : { firstName: "", lastName: "" },
    ),
  );
  const [result, setResult] = useState<{
    state: ActivityBookingState | string;
    bookingReference: string | null;
  } | null>(null);

  // Step 1: hold the cart and get the payment session token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await hold({
          data: {
            productCode: props.productCode,
            productTitle: props.productTitle,
            travelDate: props.travelDate,
            currency: props.currency,
            paxMix: props.paxMix,
            ...(props.productOptionCode ? { productOptionCode: props.productOptionCode } : {}),
            ...(props.startTime ? { startTime: props.startTime } : {}),
            ...(props.languageGuide ? { languageGuide: props.languageGuide } : {}),
            booker: props.booker,
            lines: [{ supplier: "viator", productKind: "activity" }],
          },
        })) as {
          ok: boolean;
          error?: string;
          cartRef?: string;
          accessToken?: string;
          paymentSessionToken?: string;
          total?: number;
          currency?: string;
          holdExpiresAt?: string | null;
          sessionExpiresAt?: string | null;
        };
        if (cancelled) return;
        if (!res.ok || !res.cartRef || !res.paymentSessionToken) {
          setError(res.error ?? "Could not hold this experience.");
          return;
        }
        setSession({
          cartRef: res.cartRef,
          accessToken: res.accessToken ?? "",
          token: res.paymentSessionToken,
          total: res.total ?? 0,
          currency: res.currency ?? props.currency,
          holdExpiresAt: res.holdExpiresAt ?? null,
          sessionExpiresAt: res.sessionExpiresAt ?? null,
        });
        setPhase(mode === "pay_later" ? "held" : "paying");
      } catch {
        if (!cancelled) setError("Could not start the secure checkout.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The supplier's own booking questions (per booking, per traveller, pickup).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await loadQuestions({ data: { code: props.productCode } })) as {
          ok: boolean;
          questions: BookingQuestion[];
          pickup: {
            pickupOptionType: string | null;
            allowCustomTravelerPickup: boolean;
            additionalInfo: string | null;
            locations: { reference: string; name: string | null; address: string | null }[];
          } | null;
        };
        if (cancelled || !res.ok) return;
        setQuestions(res.questions ?? []);
        setPickupInfo(res.pickup ?? null);
      } catch {
        /* questions are re-validated server-side before booking */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.productCode]);

  // Step 2: mount Viator's hosted card iFrame.
  // Viator's payment.js resolves `cardElementContainer` with
  // document.getElementById(id) — it must be the element's ID string, not a
  // DOM node (passing the node throws "e.replace is not a function" and the
  // iFrame never renders).
  useEffect(() => {
    if (!session || phase !== "paying") return;
    let disposed = false;
    const report = (event: string, detail?: string) =>
      void logEvent({
        data: {
          cartRef: session.cartRef,
          accessToken: session.accessToken,
          event,
          ...(detail ? { detail: detail.slice(0, 480) } : {}),
          origin: window.location.origin,
        },
      }).catch(() => undefined);
    (async () => {
      try {
        await loadPaymentScript();
        report("SCRIPT_LOADED");
      } catch (err) {
        report("SCRIPT_LOAD_FAILED", err instanceof Error ? err.message : undefined);
        if (!disposed) setError("Could not load the secure payment form.");
        return;
      }
      try {
        if (disposed || !containerRef.current || !window.Payment) return;
        const instance = window.Payment.init(session.token);
        const render = instance.renderCard ?? instance.renderCheckout;
        handlerRef.current = render.call(instance, {
          cardElementContainer: CARD_CONTAINER_ID,
          onFormUpdate: (e) => {
            if (e.eventType === "FORM_LOADED") {
              report("FORM_LOADED");
              setFormLoaded(true);
            }
            if (e.eventType === "FORM_ERROR") {
              report("FORM_ERROR");
              setError("The secure card form failed to load.");
            }
            if (e.eventType === "FORM_OVERDUE") report("FORM_OVERDUE");
            if (typeof e.formValid === "boolean") setFormReady(e.formValid);
          },
        });
        report("IFRAME_INIT");
      } catch (err) {
        report("IFRAME_INIT_FAILED", err instanceof Error ? err.message : undefined);
        if (!disposed) {
          setError(err instanceof Error ? err.message : "Could not load the payment form.");
        }
      }
    })();
    return () => {
      disposed = true;
      handlerRef.current?.unload?.();
      handlerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, phase]);

  const pollUntilSettled = useCallback(
    async (cartRef: string, accessToken: string) => {
      for (let i = 0; i < 8; i += 1) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = (await poll({ data: { cartRef, accessToken } })) as {
          ok: boolean;
          state?: string;
          bookingReference?: string | null;
        };
        if (res.ok && res.state && res.state !== "paid_pending_confirmation") {
          setResult({ state: res.state, bookingReference: res.bookingReference ?? null });
          return;
        }
      }
    },
    [poll],
  );

  const grouped = groupBookingQuestions(questions);
  const key = (id: string, travelerNum = 0) => `${id}#${travelerNum}`;
  const setAnswer = (id: string, travelerNum: number, value: string) =>
    setAnswers((prev) => ({ ...prev, [key(id, travelerNum)]: value }));

  /** Every answer the supplier asked for, in Viator's answer shape. */
  function collectAnswers(): BookingQuestionAnswer[] {
    const out: BookingQuestionAnswer[] = [];
    for (const q of [...grouped.perBooking, ...grouped.pickup]) {
      const value = (answers[key(q.id)] ?? "").trim();
      if (!value) continue;
      if (q.type === "LOCATION_REF_OR_FREE_TEXT") {
        const isRef = pickupInfo?.locations.some((l) => l.reference === value) ?? false;
        out.push({
          question: q.id,
          answer: value,
          unit: isRef ? LOCATION_REFERENCE_UNIT : FREETEXT_UNIT,
        });
      } else {
        out.push({ question: q.id, answer: value });
      }
    }
    for (const q of grouped.perTraveller) {
      for (let n = 1; n <= travellerCount; n += 1) {
        const value = (answers[key(q.id, n)] ?? "").trim();
        if (value) out.push({ question: q.id, answer: value, travelerNum: n });
      }
    }
    return out;
  }

  const missingAnswer = (() => {
    for (const q of [...grouped.perBooking, ...grouped.pickup]) {
      if (q.required === "MANDATORY" && !(answers[key(q.id)] ?? "").trim()) return q.label;
    }
    for (const q of grouped.perTraveller) {
      if (q.required !== "MANDATORY") continue;
      for (let n = 1; n <= travellerCount; n += 1) {
        if (!(answers[key(q.id, n)] ?? "").trim()) return `${q.label} (traveller ${n})`;
      }
    }
    if (grouped.travellerNames.length) {
      const bad = travellerNames.findIndex((t) => !t.firstName.trim() || !t.lastName.trim());
      if (bad >= 0) return `Full name for traveller ${bad + 1}`;
    }
    return null;
  })();

  async function pay() {
    if (!session || !handlerRef.current) return;
    setError(null);
    setPhase("booking");
    try {
      const tokenised = await handlerRef.current.submit({
        address: { country: billing.country.toUpperCase(), postalCode: billing.postalCode.trim() },
        email: props.booker.email,
      });
      const res = (await book({
        data: {
          cartRef: session.cartRef,
          accessToken: session.accessToken,
          paymentToken: tokenised.paymentToken,
          billing: { country: billing.country, postalCode: billing.postalCode },
          booker: props.booker,
          travellers: travellerNames,
          bookingQuestionAnswers: collectAnswers(),
        },
      })) as {
        ok: boolean;
        error?: string;
        state?: string;
        bookingReference?: string | null;
      };
      if (!res.ok) {
        setError(res.error ?? "The booking could not be completed.");
        setPhase("paying");
        return;
      }
      setResult({ state: res.state ?? "confirmed", bookingReference: res.bookingReference ?? null });
      setPhase("done");
      if (res.state === "paid_pending_confirmation") void pollUntilSettled(session.cartRef, session.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment was not completed.");
      setPhase("paying");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <div className="w-full max-w-lg overflow-y-auto rounded-2xl border border-border/60 bg-card p-6 shadow-2xl max-h-[92vh]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary">
              {mode === "pay_later" ? "Book & pay later" : "Book & pay now"}
            </p>
            <h2 className="mt-1 font-serif text-xl text-foreground">{props.productTitle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {props.travelDate} ·{" "}
              {props.paxMix.map((p) => `${p.count} ${p.ageBand.toLowerCase()}`).join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
          >
            Close
          </button>
        </div>

        {phase === "holding" ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Confirming live availability and holding your places with the supplier…
          </p>
        ) : null}

        {session && phase !== "done" ? (
          <div className="mt-5 space-y-2 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {phase === "held" ? "Total to pay" : "Total due now"}
              </span>
              <span className="text-foreground">
                {session.currency} {session.total.toFixed(2)}
              </span>
            </div>
            {formatHoldExpiry(session.holdExpiresAt) ? (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Supplier hold until</span>
                <span data-testid="viator-hold-expiry" className="text-foreground">
                  {formatHoldExpiry(session.holdExpiresAt)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {phase === "held" && session ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              Your places are held with the supplier (reference{" "}
              <span className="text-foreground">{session.cartRef}</span>). Complete payment before
              the hold lapses to confirm the booking — no charge is taken until you pay.
            </p>
            <button
              type="button"
              onClick={() => setPhase("paying")}
              className="w-full rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground"
            >
              Pay now &amp; confirm
            </button>
            <button
              type="button"
              onClick={props.onClose}
              className="w-full rounded-full border border-border px-6 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground"
            >
              Keep hold, pay later
            </button>
          </div>
        ) : null}

        {phase !== "done" && phase !== "held" ? (
          <div className={session ? "mt-5 space-y-4" : "hidden"}>
            {grouped.travellerNames.length ? (
              <fieldset className="space-y-2">
                <legend className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Traveller names (as on ID)
                </legend>
                {travellerNames.map((t, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input
                      placeholder={`Traveller ${i + 1} first name`}
                      aria-label={`Traveller ${i + 1} first name`}
                      value={t.firstName}
                      onChange={(e) =>
                        setTravellerNames((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? { ...v, firstName: e.target.value } : v,
                          ),
                        )
                      }
                      className="rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                    />
                    <input
                      placeholder={`Traveller ${i + 1} last name`}
                      aria-label={`Traveller ${i + 1} last name`}
                      value={t.lastName}
                      onChange={(e) =>
                        setTravellerNames((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? { ...v, lastName: e.target.value } : v,
                          ),
                        )
                      }
                      className="rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                    />
                  </div>
                ))}
              </fieldset>
            ) : null}

            {grouped.pickup.length ? (
              <fieldset className="space-y-2" data-testid="activity-pickup-questions">
                <legend className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Pickup &amp; travel details
                </legend>
                {pickupInfo?.additionalInfo ? (
                  <p className="text-[11px] text-muted-foreground">{pickupInfo.additionalInfo}</p>
                ) : null}
                {grouped.pickup.map((q) => (
                  <label key={q.id} className="block text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground">
                      {q.label}
                      {q.required === "MANDATORY" ? " *" : ""}
                    </span>
                    {q.id === "PICKUP_POINT" && pickupInfo?.locations.length ? (
                      <select
                        value={answers[key(q.id)] ?? ""}
                        onChange={(e) => setAnswer(q.id, 0, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                      >
                        <option value="">Select a pickup point</option>
                        {pickupInfo.locations.map((l) => (
                          <option key={l.reference} value={l.reference}>
                            {l.name ?? l.address ?? l.reference}
                          </option>
                        ))}
                        {pickupInfo.allowCustomTravelerPickup ? (
                          <option value="CUSTOM">Other — I will type my address</option>
                        ) : null}
                      </select>
                    ) : (
                      <input
                        type={q.type === "TIME" ? "time" : q.type === "DATE" ? "date" : "text"}
                        maxLength={q.maxLength ?? undefined}
                        value={answers[key(q.id)] ?? ""}
                        onChange={(e) => setAnswer(q.id, 0, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                      />
                    )}
                    {q.hint ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">{q.hint}</span>
                    ) : null}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {grouped.perBooking.length ? (
              <fieldset className="space-y-2" data-testid="activity-booking-questions">
                <legend className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Details the operator needs
                </legend>
                {grouped.perBooking.map((q) => (
                  <label key={q.id} className="block text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground">
                      {q.label}
                      {q.required === "MANDATORY" ? " *" : ""}
                    </span>
                    {q.allowedAnswers?.length ? (
                      <select
                        value={answers[key(q.id)] ?? ""}
                        onChange={(e) => setAnswer(q.id, 0, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                      >
                        <option value="">Select</option>
                        {q.allowedAnswers.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={q.type === "TIME" ? "time" : q.type === "DATE" ? "date" : "text"}
                        maxLength={q.maxLength ?? undefined}
                        value={answers[key(q.id)] ?? ""}
                        onChange={(e) => setAnswer(q.id, 0, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                      />
                    )}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {grouped.perTraveller.length ? (
              <fieldset className="space-y-2" data-testid="activity-traveller-questions">
                <legend className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Per-traveller details
                </legend>
                {Array.from({ length: travellerCount }, (_, i) => i + 1).map((n) => (
                  <div key={n} className="space-y-2 rounded-lg border border-border/50 p-3">
                    <p className="text-[11px] text-muted-foreground">Traveller {n}</p>
                    {grouped.perTraveller.map((q) => (
                      <label key={`${q.id}-${n}`} className="block text-sm">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          {q.label}
                          {q.required === "MANDATORY" ? " *" : ""}
                        </span>
                        <input
                          type={
                            q.type === "TIME" ? "time" : q.type === "DATE" ? "date" : "text"
                          }
                          maxLength={q.maxLength ?? undefined}
                          value={answers[key(q.id, n)] ?? ""}
                          onChange={(e) => setAnswer(q.id, n, e.target.value)}
                          className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
            ) : null}

            {missingAnswer ? (
              <p className="text-[11px] text-muted-foreground">
                The operator still needs: {missingAnswer}.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Billing country (ISO)
                </span>
                <input
                  value={billing.country}
                  maxLength={2}
                  onChange={(e) =>
                    setBilling({ ...billing, country: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Postal code
                </span>
                <input
                  value={billing.postalCode}
                  onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <div
              ref={containerRef}
              id={CARD_CONTAINER_ID}
              data-testid="viator-card-element"
              className="min-h-[220px] rounded-lg border border-border/60 bg-background/40 p-2"
            />
            <p className="text-[11px] text-muted-foreground">
              Card details are captured directly by a secure PCI-compliant payment form.
            </p>

            <button
              type="button"
              onClick={pay}
              disabled={
                phase === "booking" ||
                !formReady ||
                !billing.postalCode.trim() ||
                missingAnswer != null
              }
              className="w-full rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-60"
            >
              {phase === "booking" ? "Processing…" : "Pay & confirm booking"}
            </button>
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm text-foreground">
            {result.state === "confirmed" ? (
              <p>
                Confirmed. Your supplier reference is{" "}
                <strong>{result.bookingReference ?? "issued"}</strong>. A voucher is on its way to{" "}
                {props.booker.email}.
              </p>
            ) : result.state === "paid_pending_confirmation" ? (
              <p>
                Payment received. The supplier is confirming availability — we will email{" "}
                {props.booker.email} the moment it clears.
              </p>
            ) : (
              <p>
                The supplier declined this booking and no ticket was issued. Any authorisation will
                be released automatically.
              </p>
            )}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
