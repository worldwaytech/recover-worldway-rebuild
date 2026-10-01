/**
 * Viator Affiliate Full + Booking checkout.
 *
 * Worldway collects payment itself (Razorpay or Worldway Wallet) through the
 * shared paid-booking engine; the experience is sent to the operator exactly
 * once, only after payment is verified server-side, and shown as confirmed
 * only when the operator confirms it.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { PaxMix } from "@/lib/viator/checkout-contract";
import { getViatorBookingQuestions } from "@/lib/viator.functions";
import { prepareViatorActivityBooking } from "@/lib/viator/paid-checkout.functions";
import { TravelCheckout, type TravelIntent } from "@/components/up17/travel-checkout";
import {
  LOCATION_REFERENCE_UNIT,
  FREETEXT_UNIT,
  groupBookingQuestions,
  type BookingQuestion,
  type BookingQuestionAnswer,
} from "@/lib/viator/booking-questions";
import type { AgeBandRule } from "@/lib/viator/age-bands";

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
  quotedTotal?: number;
  booker: { firstName: string; lastName: string; email: string; phone?: string };
  mode?: ActivityCheckoutMode;
  onClose: () => void;
};

export function ViatorActivityCheckout(props: ActivityCheckoutProps) {
  const prepare = useServerFn(prepareViatorActivityBooking);
  const loadQuestions = useServerFn(getViatorBookingQuestions);
  const travellerCount = props.paxMix.reduce((sum, p) => sum + p.count, 0);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [intent, setIntent] = useState<TravelIntent | null>(null);
  const [questions, setQuestions] = useState<BookingQuestion[]>([]);
  const [pickupInfo, setPickupInfo] = useState<{
    pickupOptionType: string | null;
    allowCustomTravelerPickup: boolean;
    additionalInfo: string | null;
    locations: { reference: string; name: string | null; address: string | null }[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [travellerNames, setTravellerNames] = useState<{ firstName: string; lastName: string }[]>(() =>
    Array.from({ length: travellerCount }, (_, i) =>
      i === 0 ? { firstName: props.booker.firstName, lastName: props.booker.lastName } : { firstName: "", lastName: "" },
    ),
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await loadQuestions({ data: { code: props.productCode } })) as {
          ok: boolean;
          questions: BookingQuestion[];
          pickup: typeof pickupInfo;
        };
        if (cancelled || !res.ok) return;
        setQuestions(res.questions ?? []);
        setPickupInfo(res.pickup ?? null);
      } catch {
        /* re-validated server-side */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.productCode]);

  // Age bands are filled from the party you chose — never asked twice.
  const grouped = (() => {
    const g = groupBookingQuestions(questions);
    return { ...g, perTraveller: g.perTraveller.filter((q) => q.id !== "AGEBAND") };
  })();
  const key = (id: string, travelerNum = 0) => `${id}#${travelerNum}`;
  const setAnswer = (id: string, travelerNum: number, value: string) =>
    setAnswers((prev) => ({ ...prev, [key(id, travelerNum)]: value }));

  function collectAnswers(): BookingQuestionAnswer[] {
    const out: BookingQuestionAnswer[] = [];
    for (const q of [...grouped.perBooking, ...grouped.pickup]) {
      const value = (answers[key(q.id)] ?? "").trim();
      if (!value) continue;
      if (q.type === "LOCATION_REF_OR_FREE_TEXT") {
        const isRef = pickupInfo?.locations.some((l) => l.reference === value) ?? false;
        out.push({ question: q.id, answer: value, unit: isRef ? LOCATION_REFERENCE_UNIT : FREETEXT_UNIT });
      } else out.push({ question: q.id, answer: value });
    }
    for (const q of grouped.perTraveller) {
      for (let n = 1; n <= travellerCount; n += 1) {
        const value = (answers[key(q.id, n)] ?? "").trim();
        if (value) out.push({ question: q.id, answer: value, travelerNum: n, ...(q.units.length ? { unit: q.units[0] } : {}) });
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

  async function continueToPayment() {
    setError(null);
    setPreparing(true);
    try {
      const res = (await prepare({
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
          travellers: travellerNames,
          bookingQuestionAnswers: collectAnswers(),
        },
      })) as
        | { ok: false; error: string }
        | {
            ok: true;
            bookingId: string;
            reference: string;
            amountMinor: number;
            currency: string;
            cardAllowed: boolean;
            fx: { sourceCurrency: string; sourceAmount: number; rate: number } | null;
          };
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIntent({
        bookingId: res.bookingId,
        reference: res.reference,
        amountMinor: res.amountMinor,
        currency: res.currency,
        product: "activity",
        cardAllowed: res.cardAllowed,
        description: props.productTitle.slice(0, 120),
        email: props.booker.email,
        ...(props.booker.phone ? { phone: props.booker.phone } : {}),
        name: `${props.booker.firstName} ${props.booker.lastName}`,
        fx: res.fx,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this booking.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <div className="w-full max-w-lg overflow-y-auto rounded-2xl border border-border/60 bg-card p-6 shadow-2xl max-h-[92vh]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary">Book &amp; pay</p>
            <h2 className="mt-1 font-serif text-xl text-foreground">{props.productTitle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {props.travelDate} · {props.paxMix.map((p) => `${p.count} ${p.ageBand.toLowerCase()}`).join(", ")}
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Close
          </button>
        </div>

        {signedIn === false ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Sign in to book and pay. <Link to="/auth" className="text-primary underline">Sign in</Link>
          </p>
        ) : intent ? (
          <div className="mt-5">
            <TravelCheckout intent={intent} />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
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
            <button
              type="button"
              onClick={continueToPayment}
              disabled={preparing || missingAnswer != null || signedIn !== true}
              className="w-full rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-60"
            >
              {preparing ? "Checking live price…" : "Continue to payment"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              We re-check live availability and price and hold your places before you pay. Nothing is booked until payment is verified.
            </p>
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
