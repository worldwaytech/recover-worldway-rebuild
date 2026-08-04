import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | Worldway Luxe" },
      { name: "description", content: "Secure checkout — card, wire, wallet balance or installments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  return (
    <main className="pt-24">
      <section className="container-lux py-12 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-sm border border-border bg-card p-6 shadow-soft">
          <p className="eyebrow text-gold">Secure checkout</p>
          <h1 className="mt-2 font-serif text-4xl">Payment</h1>
          <p className="mt-2 text-sm text-muted-foreground">All transactions encrypted end-to-end. Funds held in a segregated trust account.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { id: "card", label: "Card", note: "Visa · MasterCard · Amex" },
              { id: "wire", label: "Bank transfer", note: "SWIFT / SEPA" },
              { id: "wallet", label: "Wallet balance", note: "Store credit & vouchers" },
              { id: "installments", label: "Installments", note: "Deposit + 2 milestones" },
            ].map((m) => (
              <label key={m.id} className="flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-background p-4 text-sm">
                <input type="radio" name="method" defaultChecked={m.id === "card"} />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.note}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Card number</span>
              <input disabled className="rounded-sm border border-border bg-background px-3 py-2" placeholder="Enable Lovable Cloud" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Name on card</span>
              <input disabled className="rounded-sm border border-border bg-background px-3 py-2" placeholder="Enable Lovable Cloud" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Expiry</span>
              <input disabled className="rounded-sm border border-border bg-background px-3 py-2" placeholder="MM / YY" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">CVC</span>
              <input disabled className="rounded-sm border border-border bg-background px-3 py-2" placeholder="•••" />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Promo code</span>
              <input className="rounded-sm border border-border bg-background px-3 py-2" placeholder="e.g. WORLDWAY10" />
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="gold" disabled>Pay deposit</Button>
            <Link to="/wallet"><Button variant="outline-ink">Use wallet</Button></Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">TODO(Lovable Cloud): create Stripe/Paddle payment intent server-side and redirect on 3DS.</p>
        </div>

        <aside className="rounded-sm border border-border bg-card p-6 shadow-soft h-fit">
          <p className="eyebrow">Order summary</p>
          <ul className="mt-4 space-y-2 border-b border-border pb-4 text-sm">
            <li className="flex justify-between"><span>Journey</span><span>$12,500</span></li>
            <li className="flex justify-between"><span>Extras</span><span>$570</span></li>
            <li className="flex justify-between"><span>Taxes & fees</span><span>$1,046</span></li>
          </ul>
          <div className="flex justify-between pt-4 font-serif text-2xl"><span>Total</span><span>$14,116</span></div>
          <p className="mt-2 text-xs text-muted-foreground">Deposit today: $3,529 · Balance 60 days pre-departure.</p>
        </aside>
      </section>
    </main>
  );
}
