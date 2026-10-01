import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { myWallet } from "@/lib/up17/booking.functions";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";
import { ChargeBreakdown } from "@/components/payments/charge-breakdown";
import { fmtMinor } from "@/components/up17/travel-checkout";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Worldway Wallet — Worldway Travels Group" },
      { name: "description", content: "Top up your Worldway Wallet and pay for flights, hotels and buses in one step." },
      { property: "og:title", content: "Worldway Wallet — Worldway Travels Group" },
      { property: "og:description", content: "Top up your Worldway Wallet and pay for flights, hotels and buses in one step." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

const KIND: Record<string, string> = {
  topup: "Top-up",
  reserve: "Held for booking",
  capture: "Paid for booking",
  release: "Hold released",
  refund: "Refund",
  adjustment: "Adjustment",
};

function WalletPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="font-serif text-5xl text-primary">Worldway Wallet</h1>
        <p className="mt-2 text-muted-foreground">Add money once, then pay for flights, hotels and buses in one step.</p>
        {signedIn === null ? null : signedIn ? <WalletBody /> : (
          <div className="mt-8 rounded-md border border-border p-6">
            <p>Sign in to see your wallet.</p>
            <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function WalletBody() {
  const get = useServerFn(myWallet);
  const q = useQuery({ queryKey: ["wallet"], queryFn: () => get() });
  const { pay, busy, error } = useRazorpayCheckout();
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const inr = q.data?.accounts.find((a) => a.currency === "INR") ?? { balanceMinor: 0, reservedMinor: 0, availableMinor: 0 };

  async function topUp() {
    setMsg(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 100 || n > 200000) return setMsg("Enter an amount between ₹100 and ₹2,00,000.");
    const r = await pay({ purpose: "wallet_topup", amount: n, currency: "INR", description: "Worldway Wallet top-up" });
    if (r) {
      setMsg("Payment verified — your wallet has been topped up.");
      setAmount("");
      void q.refetch();
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Available", inr.availableMinor], ["Held for bookings", inr.reservedMinor], ["Total balance", inr.balanceMinor]].map(([k, v]) => (
          <div key={k as string} className="rounded-md border border-border bg-card p-4">
            <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{k}</div>
            <div className="mt-1 font-serif text-2xl text-primary">{fmtMinor(v as number, "INR")}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border bg-card p-4">
        <Label htmlFor="topup">Top up (INR)</Label>
        <div className="mt-2 flex gap-2">
          <Input id="topup" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
          <Button onClick={topUp} disabled={busy}>{busy ? "Opening…" : "Add money"}</Button>
        </div>
        {Number(amount) >= 100 && Number(amount) <= 200000 ? (
          <div className="mt-3">
            <ChargeBreakdown product="wallet_topup" amountMinor={Math.round(Number(amount) * 100)} currency="INR" methods={["card"]} />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">Money is added only after the payment is verified. Paying for bookings from your Wallet has no processing fee.</p>
        {msg || error ? <p className="mt-2 text-xs">{msg ?? error}</p> : null}
      </div>
      <div>
        <h2 className="font-serif text-2xl">History</h2>
        {q.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : (q.data?.ledger.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No wallet activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {q.data!.ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div>{KIND[l.kind] ?? l.kind}{l.reference ? ` · ${l.reference}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</div>
                </div>
                <div className={l.kind === "topup" || l.kind === "refund" ? "text-primary" : ""}>
                  {l.kind === "capture" ? "−" : l.kind === "topup" || l.kind === "refund" ? "+" : ""}
                  {fmtMinor(l.amountMinor, l.currency)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
