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

type PaymentHandler = {
  submit: (
    cardMetadata: { address: { country: string; postalCode: string }; email?: string },
    options?: Record<string, unknown>,
  ) => Promise<{ paymentToken: string }>;
  unload?: () => void;
};

type PaymentInstance = {
  renderCheckout: (opts: {
    cardElementContainer: HTMLElement | string;
    onFormUpdate?: (e: { eventType: string; formValid?: boolean }) => void;
  }) => PaymentHandler;
  destruct?: () => void;
};

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlerRef = useRef<PaymentHandler | null>(null);

  const [phase, setPhase] = useState<"holding" | "held" | "paying" | "booking" | "done">(
    "holding",
  );
  const [error, setError] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [session, setSession] = useState<{
    cartRef: string;
    token: string;
    total: number;
    currency: string;
    holdExpiresAt: string | null;
    sessionExpiresAt: string | null;
  } | null>(null);
  const [billing, setBilling] = useState({ country: "US", postalCode: "" });
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
            booker: props.booker,
            lines: [{ supplier: "viator", productKind: "activity" }],
          },
        })) as {
          ok: boolean;
          error?: string;
          cartRef?: string;
          paymentSessionToken?: string;
          total?: number;
          currency?: string;
        };
        if (cancelled) return;
        if (!res.ok || !res.cartRef || !res.paymentSessionToken) {
          setError(res.error ?? "Could not hold this experience.");
          return;
        }
        setSession({
          cartRef: res.cartRef,
          token: res.paymentSessionToken,
          total: res.total ?? 0,
          currency: res.currency ?? props.currency,
        });
        setPhase("paying");
      } catch {
        if (!cancelled) setError("Could not start the secure checkout.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2: mount Viator's hosted card iFrame.
  useEffect(() => {
    if (!session || phase !== "paying") return;
    let disposed = false;
    (async () => {
      try {
        await loadPaymentScript();
        if (disposed || !containerRef.current || !window.Payment) return;
        const instance = window.Payment.init(session.token);
        handlerRef.current = instance.renderCheckout({
          cardElementContainer: containerRef.current,
          onFormUpdate: (e) => {
            if (e.eventType === "FORM_LOADED") setFormReady(true);
            if (e.eventType === "FORM_ERROR") setError("The secure card form failed to load.");
            if (typeof e.formValid === "boolean") setFormReady(true);
          },
        });
      } catch (err) {
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
  }, [session, phase]);

  const pollUntilSettled = useCallback(
    async (cartRef: string) => {
      for (let i = 0; i < 8; i += 1) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = (await poll({ data: { cartRef } })) as {
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
          paymentToken: tokenised.paymentToken,
          billing: { country: billing.country, postalCode: billing.postalCode },
          booker: props.booker,
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
      if (res.state === "paid_pending_confirmation") void pollUntilSettled(session.cartRef);
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
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary">Secure payment</p>
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
            Confirming live availability with the supplier…
          </p>
        ) : null}

        {session && phase !== "done" ? (
          <div className="mt-5 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total due now</span>
              <span className="text-foreground">
                {session.currency} {session.total.toFixed(2)}
              </span>
            </div>
          </div>
        ) : null}

        {phase !== "done" ? (
          <div className={session ? "mt-5 space-y-4" : "hidden"}>
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
              data-testid="viator-card-element"
              className="min-h-[220px] rounded-lg border border-border/60 bg-background/40 p-2"
            />
            <p className="text-[11px] text-muted-foreground">
              Card details are captured directly by Viator's PCI-compliant payment form.
            </p>

            <button
              type="button"
              onClick={pay}
              disabled={phase === "booking" || !formReady || !billing.postalCode.trim()}
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
