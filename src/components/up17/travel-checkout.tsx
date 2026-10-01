import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";
import { myWallet, payTravelBookingWithWallet } from "@/lib/up17/booking.functions";

export type TravelIntent = {
  bookingId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  priceChanged?: boolean;
  product: "flight" | "hotel" | "bus" | "cruise";
  /** False when the amount exceeds the single card transaction limit. */
  cardAllowed?: boolean;
  description: string;
  email?: string;
  phone?: string;
  name?: string;
  /** Present when a non-INR supplier price was converted at a locked live rate. */
  fx?: { sourceCurrency: string; sourceAmount: number; rate: number } | null;
};

type Outcome = { confirmed: boolean; uncertain?: boolean; message: string | null; reference: string; bookingId: string };

export const fmtMinor = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);

/** One payment step for flights, hotels and buses: Worldway Wallet or Razorpay. */
export function TravelCheckout({ intent }: { intent: TravelIntent }) {
  const walletFn = useServerFn(myWallet);
  const payWallet = useServerFn(payTravelBookingWithWallet);
  const { pay, busy: cardBusy, error: cardError } = useRazorpayCheckout();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => walletFn() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const locked = busy || cardBusy || outcome !== null;

  const available = wallet.data?.accounts.find((a) => a.currency === intent.currency)?.availableMinor ?? 0;
  const enough = available >= intent.amountMinor;

  async function byWallet() {
    setBusy(true);
    setError(null);
    try {
      const r = (await payWallet({ data: { bookingId: intent.bookingId } })) as {
        ok: boolean; confirmed?: boolean; uncertain?: boolean; error?: string; reference?: string;
      };
      if (r.confirmed) setOutcome({ confirmed: true, message: null, reference: r.reference ?? intent.reference, bookingId: intent.bookingId });
      else if (r.reference) setOutcome({ confirmed: false, uncertain: r.uncertain, message: r.error ?? null, reference: r.reference, bookingId: intent.bookingId });
      else setError(r.error ?? "The wallet payment could not be completed.");
      void wallet.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function byCard() {
    setError(null);
    const r = await pay({
      purpose: intent.product,
      currency: intent.currency,
      travelBookingId: intent.bookingId,
      description: intent.description,
      name: intent.name,
      email: intent.email,
      phone: intent.phone,
    });
    if (r?.travel) setOutcome(r.travel);
  }

  if (outcome) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm">
        <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Worldway reference</div>
        <div className="mt-1 font-serif text-2xl text-primary">{outcome.reference}</div>
        <p className="mt-3">
          {outcome.confirmed ? "Booking confirmed." : outcome.message ?? "Payment received — the Worldway team is finalising your booking."}
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link to="/account/travel/$id" params={{ id: outcome.bookingId }}>View booking</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground">Total (live price)</span>
        <span className="font-serif text-2xl text-primary">{fmtMinor(intent.amountMinor, intent.currency)}</span>
      </div>
      <ul className="space-y-1 border-y border-border py-2 text-xs">
        {intent.fx ? (
          <li className="flex justify-between gap-3"><span className="text-muted-foreground">Currency conversion</span><span className="text-right">{intent.fx.sourceCurrency} {intent.fx.sourceAmount.toLocaleString("en-IN")} at live rate {intent.fx.rate.toFixed(4)}, locked for this checkout</span></li>
        ) : null}
        <li className="flex justify-between gap-3"><span className="text-muted-foreground">Payment processing fee</span><span>₹0 · paid by Worldway</span></li>
        <li className="flex justify-between gap-3 font-medium"><span>Total payable</span><span>{fmtMinor(intent.amountMinor, intent.currency)}</span></li>
      </ul>
      {intent.priceChanged ? <p className="text-xs text-destructive">The price changed since your search. This is the current live price.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={byWallet} disabled={locked || !enough}>
          {busy ? "Booking…" : `Pay with Wallet`}
        </Button>
        <Button variant="outline" onClick={byCard} disabled={locked || intent.cardAllowed === false}>
          {cardBusy ? "Opening payment…" : "Pay by card / UPI"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Wallet available: {fmtMinor(available, intent.currency)}
        {!enough ? <> · <Link to="/wallet" className="underline">Top up</Link></> : null}
      </p>
      {intent.cardAllowed === false ? (
        <p className="text-xs text-muted-foreground">This amount is above the single card payment limit. Top up your Worldway Wallet by card/UPI, then pay from the wallet.</p>
      ) : null}
      {error || cardError ? <p className="text-xs text-destructive">{error ?? cardError}</p> : null}
      <p className="text-[0.7rem] text-muted-foreground">Your booking is sent once only, after payment. It shows as confirmed only when it is confirmed.</p>
    </div>
  );
}
