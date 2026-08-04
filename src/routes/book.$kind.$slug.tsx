import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useReducer } from "react";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/enterprise";

// TODO(Lovable Cloud): persist booking drafts to `booking_drafts` scoped by
// auth.uid (or session id for guests), and confirm on payment success.

type Step = "travelers" | "extras" | "review" | "payment" | "confirmation";

interface Traveler { firstName: string; lastName: string; dob: string; passport: string }
interface State { step: Step; travelers: Traveler[]; extras: Record<string, boolean>; coupon: string; consent: boolean; reference?: string }

const initial: State = {
  step: "travelers",
  travelers: [{ firstName: "", lastName: "", dob: "", passport: "" }],
  extras: {},
  coupon: "",
  consent: false,
};

type Action =
  | { type: "step"; step: Step }
  | { type: "addTraveler" }
  | { type: "removeTraveler"; index: number }
  | { type: "traveler"; index: number; patch: Partial<Traveler> }
  | { type: "extra"; key: string; on: boolean }
  | { type: "coupon"; value: string }
  | { type: "consent"; on: boolean }
  | { type: "reference"; value: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "step": return { ...s, step: a.step };
    case "addTraveler": return { ...s, travelers: [...s.travelers, { firstName: "", lastName: "", dob: "", passport: "" }] };
    case "removeTraveler": return { ...s, travelers: s.travelers.filter((_, i) => i !== a.index) };
    case "traveler": return { ...s, travelers: s.travelers.map((t, i) => i === a.index ? { ...t, ...a.patch } : t) };
    case "extra": return { ...s, extras: { ...s.extras, [a.key]: a.on } };
    case "coupon": return { ...s, coupon: a.value };
    case "consent": return { ...s, consent: a.on };
    case "reference": return { ...s, reference: a.value, step: "confirmation" };
  }
}

const EXTRAS = [
  { key: "insurance", label: "Comprehensive travel insurance", price: 350 },
  { key: "transfer", label: "Private airport transfers", price: 220 },
  { key: "upgrade", label: "Category upgrade", price: 950 },
  { key: "photographer", label: "Private photographer (half day)", price: 780 },
];

const steps: { key: Step; title: string; text: string }[] = [
  { key: "travelers", title: "Traveler details", text: "Full legal names, dates of birth and passport numbers." },
  { key: "extras", title: "Extras & add-ons", text: "Insurance, transfers, upgrades and special experiences." },
  { key: "review", title: "Review & price", text: "Final itinerary, price breakdown and terms." },
  { key: "payment", title: "Payment", text: "Deposit, milestone or balance payment." },
  { key: "confirmation", title: "Confirmation", text: "Booking reference and next steps." },
];

export const Route = createFileRoute("/book/$kind/$slug")({
  head: () => ({
    meta: [
      { title: "Book | Worldway Luxe" },
      { name: "description", content: "Enterprise booking flow — traveler details, extras, review, payment and confirmation." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookFlow,
});

function BookFlow() {
  const { kind, slug } = Route.useParams();
  const [state, dispatch] = useReducer(reducer, initial);
  const navigate = useNavigate();

  const basePrice = 12500;
  const extrasTotal = EXTRAS.reduce((n, e) => (state.extras[e.key] ? n + e.price : n), 0);
  const subtotal = basePrice * state.travelers.length + extrasTotal;
  const taxes = Math.round(subtotal * 0.08);
  const discount = state.coupon.toUpperCase() === "WORLDWAY10" ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + taxes - discount;
  const deposit = Math.round(total * 0.25);

  const stepIndex = steps.findIndex((s) => s.key === state.step);
  const go = (key: Step) => dispatch({ type: "step", step: key });
  const next = () => go(steps[Math.min(stepIndex + 1, steps.length - 1)].key);
  const back = () => go(steps[Math.max(stepIndex - 1, 0)].key);

  return (
    <main className="pt-24">
      <section className="container-lux py-12">
        <p className="eyebrow text-gold">Booking · {kind}</p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl">Complete your booking</h1>
        <p className="mt-2 text-sm text-muted-foreground">Reference item: {slug}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
          <div>
            <ol className="mb-8 flex flex-wrap gap-x-8 gap-y-2 text-xs uppercase tracking-widest">
              {steps.map((s, i) => (
                <li key={s.key} className={`border-b-2 pb-2 ${i === stepIndex ? "border-gold text-foreground" : i < stepIndex ? "border-border text-muted-foreground" : "border-transparent text-muted-foreground/60"}`}>
                  {i + 1}. {s.title}
                </li>
              ))}
            </ol>

            <div className="rounded-sm border border-border bg-card p-6 shadow-soft">
              {state.step === "travelers" && (
                <div className="space-y-6">
                  {state.travelers.map((t, i) => (
                    <div key={i} className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2 flex items-center justify-between">
                        <p className="font-serif text-xl">Traveler {i + 1}</p>
                        {state.travelers.length > 1 && (
                          <button type="button" onClick={() => dispatch({ type: "removeTraveler", index: i })} className="text-xs uppercase tracking-widest text-destructive">Remove</button>
                        )}
                      </div>
                      {(["firstName", "lastName", "dob", "passport"] as const).map((k) => (
                        <label key={k} className="grid gap-1 text-sm">
                          <span className="text-xs uppercase tracking-widest text-muted-foreground">{k}</span>
                          <input value={t[k]} onChange={(e) => dispatch({ type: "traveler", index: i, patch: { [k]: e.target.value } })} className="rounded-sm border border-border bg-background px-3 py-2" />
                        </label>
                      ))}
                    </div>
                  ))}
                  <Button variant="outline-ink" size="sm" onClick={() => dispatch({ type: "addTraveler" })}>Add traveler</Button>
                </div>
              )}

              {state.step === "extras" && (
                <div className="space-y-3">
                  {EXTRAS.map((e) => (
                    <label key={e.key} className="flex items-center justify-between rounded-sm border border-border bg-background px-4 py-3 text-sm">
                      <span className="flex items-center gap-3">
                        <input type="checkbox" checked={!!state.extras[e.key]} onChange={(ev) => dispatch({ type: "extra", key: e.key, on: ev.target.checked })} />
                        {e.label}
                      </span>
                      <span className="font-medium">${e.price.toLocaleString()}</span>
                    </label>
                  ))}
                  <label className="mt-4 grid max-w-sm gap-1 text-sm">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Promo code</span>
                    <input value={state.coupon} onChange={(e) => dispatch({ type: "coupon", value: e.target.value })} className="rounded-sm border border-border bg-background px-3 py-2" placeholder="Try WORLDWAY10" />
                  </label>
                </div>
              )}

              {state.step === "review" && (
                <div className="space-y-4">
                  <p className="font-serif text-xl">Review your booking</p>
                  <p className="text-sm text-muted-foreground">{state.travelers.length} traveler(s) · {Object.values(state.extras).filter(Boolean).length} extras</p>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={state.consent} onChange={(e) => dispatch({ type: "consent", on: e.target.checked })} className="mt-1" />
                    <span>I agree to the <Link to="/terms" className="text-gold">Terms & Conditions</Link> and <Link to="/privacy" className="text-gold">Privacy Policy</Link>.</span>
                  </label>
                </div>
              )}

              {state.step === "payment" && (
                <div className="space-y-4">
                  <p className="font-serif text-xl">Payment</p>
                  <p className="text-sm text-muted-foreground">Deposit today · balance due 60 days before departure.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                  <p className="text-xs text-muted-foreground">TODO(Lovable Cloud): payment intent via Stripe/Paddle server function.</p>
                </div>
              )}

              {state.step === "confirmation" && (
                <div className="text-center">
                  <p className="eyebrow text-gold">Booking received</p>
                  <p className="mt-2 font-serif text-3xl">Reference {state.reference}</p>
                  <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">A confirmation email is on its way. Your specialist will be in touch within 24 hours.</p>
                  <div className="mt-6 flex justify-center gap-3">
                    <Link to="/portal"><Button variant="gold">Open guest portal</Button></Link>
                    <button onClick={() => navigate({ to: "/" })} className="text-xs uppercase tracking-widest text-gold">Return home</button>
                  </div>
                </div>
              )}
            </div>

            {state.step !== "confirmation" && (
              <div className="mt-6 flex items-center justify-between">
                <Button variant="outline-ink" onClick={back} disabled={stepIndex === 0}>Back</Button>
                {state.step === "payment" ? (
                  <Button variant="gold" onClick={() => dispatch({ type: "reference", value: `WWL-${Date.now().toString(36).toUpperCase()}` })}>Confirm & pay ${deposit.toLocaleString()}</Button>
                ) : (
                  <Button variant="gold" onClick={next} disabled={state.step === "review" && !state.consent}>Continue</Button>
                )}
              </div>
            )}
          </div>

          <aside className="rounded-sm border border-border bg-card p-6 shadow-soft h-fit lg:sticky lg:top-28">
            <p className="eyebrow">Price breakdown</p>
            <ul className="mt-4 space-y-2 border-b border-border pb-4 text-sm">
              <li className="flex justify-between"><span>Journey × {state.travelers.length}</span><span>${(basePrice * state.travelers.length).toLocaleString()}</span></li>
              <li className="flex justify-between"><span>Extras</span><span>${extrasTotal.toLocaleString()}</span></li>
              <li className="flex justify-between"><span>Taxes & fees (8%)</span><span>${taxes.toLocaleString()}</span></li>
              {discount > 0 && <li className="flex justify-between text-gold"><span>Promotion</span><span>-${discount.toLocaleString()}</span></li>}
            </ul>
            <div className="flex justify-between pt-4 font-serif text-2xl"><span>Total</span><span>${total.toLocaleString()}</span></div>
            <p className="mt-2 text-xs text-muted-foreground">Deposit today: ${deposit.toLocaleString()} · Balance 60 days pre-departure.</p>

            <div className="mt-6">
              <p className="eyebrow mb-3">Booking journey</p>
              <Timeline steps={steps.map((s) => ({ title: s.title, text: s.text }))} />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
