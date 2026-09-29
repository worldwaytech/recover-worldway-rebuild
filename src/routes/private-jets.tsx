import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/search-shell";
import { AirportAutocomplete, airportCode } from "@/components/aviation/airport-autocomplete";
import type { AirportOption } from "@/lib/aviation/private-aviation.functions";
import {
  getJetEstimate,
  requestJetConfirmation,
  type JetEstimateOption,
} from "@/lib/aviation/private-aviation.functions";
import {
  AvLabel,
  avField,
  ContactFields,
  money,
  SignInPrompt,
  useSignedInEmail,
  type ContactValues,
} from "@/components/aviation/contact-fields";

const HERO = "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80";

export const Route = createFileRoute("/private-jets")({
  head: () => ({
    meta: [
      { title: "Private Jet Charter — Worldway Private Aviation" },
      { name: "description", content: "Instant private jet charter estimates, then confirmed live pricing with real aircraft availability from Worldway Private Aviation." },
      { property: "og:title", content: "Private Jet Charter — Worldway Private Aviation" },
      { property: "og:description", content: "Instant light, midsize and heavy jet estimates for any route, then confirmed live pricing." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: HERO },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: HERO },
    ],
  }),
  component: JetsPage,
});

type Estimate = { estimateId: string; reference: string; route: string; options: JetEstimateOption[] };

function JetsPage() {
  const estimateFn = useServerFn(getJetEstimate);
  const confirmFn = useServerFn(requestJetConfirmation);
  const auth = useSignedInEmail();

  const [origin, setOrigin] = useState<AirportOption | null>(null);
  const [destination, setDestination] = useState<AirportOption | null>(null);
  const [pax, setPax] = useState(4);
  const [roundTrip, setRoundTrip] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [category, setCategory] = useState<string>("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [flags, setFlags] = useState({ flexibleDates: false, luggage: false, pets: false, wheelchair: false });
  const [contact, setContact] = useState<ContactValues>({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" });
  const [optIn, setOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ reference: string; pendingCheck?: boolean } | null>(null);

  async function onEstimate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!origin || !destination) {
      setError("Please choose both airports from the list.");
      return;
    }
    if (airportCode(origin) === airportCode(destination)) {
      setError("Departure and arrival airports must be different.");
      return;
    }
    const o = airportCode(origin);
    const d = airportCode(destination);
    setError(null);
    setEst(null);
    setDone(null);
    setLoading(true);
    try {
      const r = await estimateFn({ data: { origin: o, destination: d, passengers: pax, roundTrip } });
      if (!r.ok) setError(r.error);
      else {
        setEst(r);
        setCategory(r.options[0]?.category ?? "");
        if (auth.email && !contact.email) setContact((c) => ({ ...c, email: auth.email! }));
      }
    } catch {
      setError("Pricing is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!est || !optIn) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await confirmFn({
        data: {
          estimateId: est.estimateId,
          optIn: true,
          departureDate,
          returnDate: roundTrip && returnDate ? returnDate : undefined,
          aircraftCategory: category || undefined,
          ...contact,
          specialRequests: contact.specialRequests || undefined,
          ...flags,
        },
      });
      if (!r.ok) setError(r.error);
      else setDone({ reference: r.reference, pendingCheck: "pendingCheck" in r ? r.pendingCheck : undefined });
    } catch (err) {
      setError(err instanceof Response && err.status === 401 ? "Please sign in to continue." : "We couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell>
      <PageHero
        eyebrow="Worldway Private Aviation · Private Jets"
        title="Wheels up, on your schedule."
        subtitle="Instant charter estimates for any route — then confirmed live pricing with real aircraft availability."
        image={HERO}
      />

      <section className="mx-auto -mt-16 max-w-5xl px-6">
        <form onSubmit={onEstimate} className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">Step 1 · Instant estimate</div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <AvLabel label="From"><AirportAutocomplete ariaLabel="From airport" value={origin} onSelect={setOrigin} required placeholder="City, airport or code — London, LTN…" /></AvLabel>
            <AvLabel label="To"><AirportAutocomplete ariaLabel="To airport" value={destination} onSelect={setDestination} required placeholder="Nice, NCE…" /></AvLabel>
            <AvLabel label="Passengers">
              <input type="number" min={1} max={40} value={pax} onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))} className={avField} />
            </AvLabel>
            <AvLabel label="Journey">
              <select value={roundTrip ? "rt" : "ow"} onChange={(e) => setRoundTrip(e.target.value === "rt")} className={avField}>
                <option value="ow">One way</option>
                <option value="rt">Round trip</option>
              </select>
            </AvLabel>
          </div>
          <div className="mt-5 flex justify-end">
            <button disabled={loading} className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-50">
              {loading ? "Pricing…" : "Get instant estimate"}
            </button>
          </div>
        </form>
      </section>

      <section className="mx-auto mt-10 max-w-5xl px-6 pb-24">
        {error && <div className="mb-6 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</div>}

        {done ? (
          <div className="rounded-2xl border border-primary/40 bg-card/70 p-8 text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-primary">Request received</div>
            <h2 className="mt-3 font-serif text-3xl">Your Worldway reference: {done.reference}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Our Private Aviation desk is now sourcing vetted operators for real aircraft and confirmed pricing. We'll contact you by email and phone with your confirmed options and a secure booking and payment link.
            </p>
            <Link to="/private-aviation/quote/$reference" params={{ reference: done.reference }} className="mt-6 inline-block text-xs uppercase tracking-[0.3em] text-primary hover:underline">Track this request →</Link>
          </div>
        ) : est ? (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-serif text-3xl">{est.route}</h2>
              <span className="text-xs text-muted-foreground">{pax} passenger{pax > 1 ? "s" : ""} · {roundTrip ? "round trip" : "one way"}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {est.options.map((o) => (
                <button
                  type="button"
                  key={o.category}
                  onClick={() => setCategory(o.category)}
                  className={`rounded-2xl border p-5 text-left transition-colors ${category === o.category ? "border-primary bg-primary/10" : "border-border/60 bg-card/60 hover:border-primary/50"}`}
                >
                  <div className="text-[10px] uppercase tracking-[0.3em] text-primary">{o.category}</div>
                  <div className="mt-2 font-serif text-3xl">~{money(o.estimate, o.currency)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Range {money(o.low, o.currency)} – {money(o.high, o.currency)}</div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Indicative estimates based on historical charter pricing — not a confirmed price. Confirmed, bookable pricing with real aircraft availability is the next step.
            </p>

            <form onSubmit={onConfirm} className="mt-10 rounded-2xl border border-border/60 bg-card/70 p-6 md:p-8">
              <div className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">Step 2 · Confirmed live pricing</div>
              {!auth.ready ? null : !auth.email ? (
                <SignInPrompt what="request confirmed pricing" />
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <AvLabel label="Departure date"><input type="date" required min={today} value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className={avField} /></AvLabel>
                    {roundTrip && (
                      <AvLabel label="Return date"><input type="date" required min={departureDate || today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={avField} /></AvLabel>
                    )}
                    <AvLabel label="Aircraft preference">
                      <select value={category} onChange={(e) => setCategory(e.target.value)} className={avField}>
                        <option value="">No preference</option>
                        {est.options.map((o) => <option key={o.category} value={o.category}>{o.category}</option>)}
                      </select>
                    </AvLabel>
                  </div>
                  <ContactFields value={contact} onChange={setContact} />
                  <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
                    {(["flexibleDates", "luggage", "pets", "wheelchair"] as const).map((k) => (
                      <label key={k} className="flex items-center gap-2">
                        <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />
                        {{ flexibleDates: "Flexible dates", luggage: "Extra / outsized luggage", pets: "Travelling with pets", wheelchair: "Wheelchair access" }[k]}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                    <input type="checkbox" className="mt-1" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                    <span>I've reviewed the estimate above and want Worldway Private Aviation to request confirmed live pricing from vetted operators for this trip.</span>
                  </label>
                  <div className="flex justify-end">
                    <button disabled={!optIn || submitting || !departureDate} className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-40">
                      {submitting ? "Submitting…" : "Request confirmed pricing"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 text-sm text-muted-foreground">
            Enter your route for instant light, midsize and heavy jet estimates. Looking for a bargain? See our{" "}
            <Link to="/private-aviation/empty-legs" className="text-primary underline">live empty legs</Link>.
          </div>
        )}
      </section>
    </PageShell>
  );
}
