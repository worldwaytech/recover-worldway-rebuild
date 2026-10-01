import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPaymentOrder, verifyPaymentSignature } from "@/lib/payments/razorpay.functions";
import type { PaymentPurpose } from "@/lib/payments/plans";

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayHandlerResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void; on: (event: string, cb: (p: unknown) => void) => void };

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

function loadCheckoutScript(): Promise<RazorpayConstructor> {
  return new Promise((resolve, reject) => {
    const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
    if (existing) {
      resolve(existing);
      return;
    }
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay checkout could not be initialised."));
    };
    el.onerror = () => reject(new Error("Razorpay checkout could not be loaded."));
    document.body.appendChild(el);
  });
}

export type PayResult = {
  paymentId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  method: string | null;
  /** Tour bookings only: Worldway reference + whether the booking was accepted. */
  tour?: { confirmed: boolean; worldwayReference: string } | null;
  /** Flight/hotel/bus bookings: Worldway reference + genuine supplier outcome. */
  travel?: { confirmed: boolean; uncertain: boolean; reference: string; bookingId: string; message: string | null } | null;
};

export type PayRequest = {
  purpose: PaymentPurpose;
  amount?: number;
  currency?: string;
  planId?: string;
  description?: string;
  name?: string;
  email?: string;
  phone?: string;
  reference?: Record<string, string | number | boolean>;
  flightFare?: {
    resultIndex: string;
    searchTokenId: string;
    extras?: { baggage?: string[]; meal?: string[]; seat?: string[] }[];
  };
  prePurchasedBookingId?: string;
  aviationReference?: string;
  tourBookingId?: string;
  travelBookingId?: string;
};

/**
 * Opens Razorpay Checkout, then verifies the handoff signature server-side.
 * Resolves only once the payment is verified as captured/authorised.
 */
export function useRazorpayCheckout() {
  const createOrder = useServerFn(createPaymentOrder);
  const verify = useServerFn(verifyPaymentSignature);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);

  const pay = useCallback(
    async (req: PayRequest): Promise<PayResult | null> => {
      if (active.current) return null;
      active.current = true;
      setBusy(true);
      setError(null);
      try {
        const order = await createOrder({
          data: {
            purpose: req.purpose,
            currency: (req.currency ?? "INR").toUpperCase(),
            ...(req.amount === undefined ? {} : { amount: req.amount }),
            ...(req.planId ? { planId: req.planId } : {}),
            ...(req.description ? { description: req.description.slice(0, 200) } : {}),
            ...(req.email ? { email: req.email } : {}),
            ...(req.phone ? { phone: req.phone } : {}),
            ...(req.reference ? { reference: req.reference } : {}),
            ...(req.flightFare ? { flightFare: req.flightFare } : {}),
            ...(req.prePurchasedBookingId ? { prePurchasedBookingId: req.prePurchasedBookingId } : {}),
            ...(req.aviationReference ? { aviationReference: req.aviationReference } : {}),
            ...(req.tourBookingId ? { tourBookingId: req.tourBookingId } : {}),
            ...(req.travelBookingId ? { travelBookingId: req.travelBookingId } : {}),
          },
        });

        if (!order.ok) {
          setError(order.error ?? "Could not start the payment.");
          return null;
        }

        const Razorpay = await loadCheckoutScript();

        const result = await new Promise<RazorpayHandlerResponse | null>((resolve) => {
          const rzp = new Razorpay({
            key: order.keyId,
            order_id: order.orderId,
            amount: order.amountMinor,
            currency: order.currency,
            name: "Worldway Travels Group",
            description: req.description ?? "Worldway Travels Group booking",
            prefill: {
              ...(req.name ? { name: req.name } : {}),
              ...(req.email ? { email: req.email } : {}),
              ...(req.phone ? { contact: req.phone } : {}),
            },
            notes: { receipt: order.receipt },
            theme: { color: "#B8912F" },
            retry: { enabled: false },
            modal: { ondismiss: () => resolve(null) },
            handler: (response: RazorpayHandlerResponse) => resolve(response),
          });
          rzp.on("payment.failed", (payload: unknown) => {
            const p = payload as { error?: { description?: string } } | undefined;
            setError(p?.error?.description ?? "The payment was declined.");
            resolve(null);
          });
          rzp.open();
        });

        if (!result) {
          setError((prev) => prev ?? "Payment was cancelled before completion.");
          return null;
        }

        const verified = await verify({
          data: {
            orderId: result.razorpay_order_id,
            paymentId: result.razorpay_payment_id,
            signature: result.razorpay_signature,
          },
        });

        if (!verified.ok) {
          setError(verified.error ?? "Payment verification failed.");
          return null;
        }

        return {
          paymentId: verified.paymentId,
          orderId: verified.orderId,
          amountMinor: verified.amountMinor,
          currency: verified.currency,
          method: verified.method,
          tour: (verified as { tour?: { confirmed: boolean; worldwayReference: string } | null }).tour ?? null,
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Payment could not be completed.");
        return null;
      } finally {
        active.current = false;
        setBusy(false);
      }
    },
    [createOrder, verify],
  );

  return { pay, busy, error, setError };
}
