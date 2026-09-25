import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PageShell, PageHero } from "@/components/search-shell";
import { Field, inputClass } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import {
  finalizePrePurchasedBooking,
  listPrePurchasedSectors,
  reservePrePurchasedFare,
  searchPrePurchasedFares,
} from "@/lib/airiq/airiq.functions";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";
import { portal } from "@/lib/portal-store";

export const Route = createFileRoute("/pre-purchased-flights")({
  head: () => ({
    meta: [
      { title: "Pre-Purchased Flights — Worldway Travels Group" },
      { name: "description", content: "Book pre-purchased seats on popular routes with confirmed fares and instant pricing." },
      { property: "og:title", content: "Pre-Purchased Flights — Worldway Travels Group" },
      { property: "og:description", content: "Pre-blocked seats with confirmed fares on popular routes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrePurchasedFlightsPage,
});

type Sector = { label: string; origin: string; destination: string };
type Fare = {
  ticketId: string; origin: string; destination: string; airline: string; flightNumber: string; route: string;
  departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string; seats: number;
  price: number; infantPrice: number; cabinBaggage: string | null; handLuggage: string | null; international: boolean; total: number;
};
type Pax = { title: string; first_name: string; last_name: string; dob: string; passport_number: string; passport_expirydate: string; passport_issuing_country_code: string; nationality: string };
const emptyPax = (title: string): Pax => ({ title, first_name: "", last_name: "", dob: "", passport_number: "", passport_expirydate: "", passport_issuing_country_code: "IN", nationality: "Indian" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function PrePurchasedFlightsPage() {
  const loadSectors = useServerFn(listPrePurchasedSectors);
  const search = useServerFn(searchPrePurchasedFares);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [query, setQuery] = useState<{ origin: string; destination: string; date: string; adult: number; child: number; infant: number } | null>(null);
  const [fares, setFares] = useState<Fare[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Fare | null>(null);

  useEffect(() => {
    loadSectors().then((r) => {
      setSectors(r.sectors);
      if (!r.ok) setSectorError(r.error ?? null);
    }).catch(() => setSectorError("Routes are temporarily unavailable."));
  }, [loadSectors]);

  const origins = useMemo(() => [...new Map(sectors.map((s) => [s.origin, s.label.split("//")[0]?.trim() ?? s.origin])).entries()], [sectors]);
  const destinations = useMemo(() => sectors.filter((s) => s.origin === origin), [sectors, origin]);

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = { origin, destination, date: String(f.get("date")), adult: Number(f.get("adult") || 1), child: Number(f.get("child") || 0), infant: Number(f.get("infant") || 0) };
    setQuery(q); setSelected(null); setLoading(true); setError(null); setFares(null);
    try {
      const r = await search({ data: q });
      if (!r.ok) setError(r.error ?? "Search failed");
      else setFares(r.fares as Fare[]);
    } catch { setError("Search failed. Please try again."); } finally { setLoading(false); }
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Pre-Purchased Flights"
        title="Pre-blocked seats, ready to book."
        subtitle="Confirmed seats on popular routes, priced live and ticketed by our flight desk."
        image="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=2000&q=80"
      />
      <section className="mx-auto max-w-5xl px-6">
        <form onSubmit={onSearch} className="grid gap-4 rounded-md border border-border bg-card p-6 md:grid-cols-3">
          <Field label="From">
            <select required className={inputClass} value={origin} onChange={(e) => { setOrigin(e.target.value); setDestination(""); }}>
              <option value="">Select origin</option>
              {origins.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
            </select>
          </Field>
          <Field label="To">
            <select required className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)} disabled={!origin}>
              <option value="">Select destination</option>
              {destinations.map((s) => <option key={s.destination} value={s.destination}>{s.label.split("//")[1]?.trim() ?? s.destination} ({s.destination})</option>)}
            </select>
          </Field>
          <Field label="Departure"><input type="date" name="date" required className={inputClass} /></Field>
          <Field label="Adults"><input type="number" name="adult" min={1} max={9} defaultValue={1} className={inputClass} /></Field>
          <Field label="Children (2–11)"><input type="number" name="child" min={0} max={8} defaultValue={0} className={inputClass} /></Field>
          <Field label="Infants (under 2)"><input type="number" name="infant" min={0} max={4} defaultValue={0} className={inputClass} /></Field>
          <div className="md:col-span-3 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">{sectorError ?? (sectors.length ? `${sectors.length} routes available` : "Loading routes…")}</p>
            <Button type="submit" disabled={loading || !origin || !destination}>{loading ? "Searching…" : "Search fares"}</Button>
          </div>
        </form>

        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}
        {fares && !fares.length ? <p className="mt-6 text-sm text-muted-foreground">No pre-purchased seats on this date. Try another date.</p> : null}
        {fares?.length ? (
          <div className="mt-6 grid gap-3">
            {fares.map((f) => (
              <div key={f.ticketId} className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
                <div>
                  <p className="font-serif text-lg">{f.departureTime} → {f.arrivalTime} <span className="text-sm text-muted-foreground">· {f.airline} {f.flightNumber}</span></p>
                  <p className="text-xs text-muted-foreground">{f.origin} → {f.destination} · {f.route} · {f.departureDate} · Check-in {f.cabinBaggage ?? "—"} kg, cabin {f.handLuggage ?? "—"} kg · {f.seats} seats left</p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-xl text-primary">{inr(f.total)}</p>
                  <p className="text-xs text-muted-foreground">{inr(f.price)} per seat</p>
                  <Button size="sm" className="mt-2" onClick={() => setSelected(f)}>Select</Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {selected && query ? <BookingForm fare={selected} query={query} onClose={() => setSelected(null)} /> : null}
      </section>
    </PageShell>
  );
}

function BookingForm({ fare, query, onClose }: { fare: Fare; query: { origin: string; destination: string; date: string; adult: number; child: number; infant: number }; onClose: () => void }) {
  const reserve = useServerFn(reservePrePurchasedFare);
  const finalize = useServerFn(finalizePrePurchasedBooking);
  const { pay, busy, error: payError } = useRazorpayCheckout();
  const [adults, setAdults] = useState<Pax[]>(() => Array.from({ length: query.adult }, () => emptyPax("Mr.")));
  const [children, setChildren] = useState<Pax[]>(() => Array.from({ length: query.child }, () => emptyPax("Mstr.")));
  const [infants, setInfants] = useState<Pax[]>(() => Array.from({ length: query.infant }, () => emptyPax("Mstr.")));
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const signedIn = !!portal.session();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setWorking(true); setMsg(null);
    try {
      const clean = (list: Pax[]) => list.map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "")));
      const r = await reserve({ data: { ...query, ticketId: fare.ticketId, contactEmail: email, contactPhone: phone, adults: clean(adults), children: clean(children), infants: clean(infants) } });
      if (!r.ok) { setMsg(r.error); return; }
      const paid = await pay({ purpose: "flight", currency: "INR", prePurchasedBookingId: r.bookingId, description: `Pre-purchased flight ${r.reference}`, email, phone, name: `${adults[0]?.first_name} ${adults[0]?.last_name}` });
      if (!paid) { setMsg(`Booking ${r.reference} saved — payment not completed.`); return; }
      const f = await finalize({ data: { bookingId: r.bookingId, orderId: paid.orderId } });
      setMsg(f.ok ? `Payment received for ${r.reference}. ${f.message}` : f.error);
    } catch (err) {
      setMsg(err instanceof Error && /Unauthorized/i.test(err.message) ? "Please sign in to complete this booking." : "Something went wrong. Please try again.");
    } finally { setWorking(false); }
  }

  const row = (list: Pax[], set: (l: Pax[]) => void, label: string, titles: string[], needDob: boolean) =>
    list.map((p, i) => {
      const upd = (k: keyof Pax, v: string) => set(list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
      return (
        <div key={`${label}${i}`} className="grid gap-3 rounded-sm border border-border/60 p-3 md:grid-cols-4">
          <p className="md:col-span-4 text-xs uppercase tracking-widest text-muted-foreground">{label} {i + 1}</p>
          <select className={inputClass} value={p.title} onChange={(e) => upd("title", e.target.value)}>{titles.map((t) => <option key={t}>{t}</option>)}</select>
          <input required placeholder="First name" className={inputClass} value={p.first_name} onChange={(e) => upd("first_name", e.target.value)} />
          <input required placeholder="Last name" className={inputClass} value={p.last_name} onChange={(e) => upd("last_name", e.target.value)} />
          {needDob || fare.international ? <input required type="date" aria-label="Date of birth" className={inputClass} value={p.dob} onChange={(e) => upd("dob", e.target.value)} /> : <span />}
          {fare.international ? (
            <>
              <input required placeholder="Passport number" className={inputClass} value={p.passport_number} onChange={(e) => upd("passport_number", e.target.value)} />
              <input required type="date" aria-label="Passport expiry" className={inputClass} value={p.passport_expirydate} onChange={(e) => upd("passport_expirydate", e.target.value)} />
              <input required maxLength={2} placeholder="Issuing country (IN)" className={inputClass} value={p.passport_issuing_country_code} onChange={(e) => upd("passport_issuing_country_code", e.target.value.toUpperCase())} />
              <input required placeholder="Nationality" className={inputClass} value={p.nationality} onChange={(e) => upd("nationality", e.target.value)} />
            </>
          ) : null}
        </div>
      );
    });

  return (
    <form onSubmit={submit} className="mt-8 grid gap-4 rounded-md border border-primary/40 bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow text-primary">Traveller details</p>
          <h2 className="font-serif text-2xl">{fare.origin} → {fare.destination} · {fare.departureDate} {fare.departureTime}</h2>
          <p className="text-sm text-muted-foreground">Total {inr(fare.total)} · the fare is re-checked live before payment and again before ticketing.</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-primary">Close</button>
      </div>
      {row(adults, setAdults, "Adult", ["Mr.", "Mrs.", "Ms."], false)}
      {row(children, setChildren, "Child", ["Mstr.", "Miss"], false)}
      {row(infants, setInfants, "Infant", ["Mstr.", "Miss"], true)}
      <div className="grid gap-3 md:grid-cols-2">
        <input required type="email" placeholder="Contact email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input required placeholder="Mobile number" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Pre-purchased fares are non-refundable once ticketed; changes and cancellations are handled by our flight desk under the airline's terms.</p>
      {msg || payError ? <p className="text-sm text-primary">{msg ?? payError}</p> : null}
      {signedIn ? (
        <Button type="submit" disabled={working || busy}>{working || busy ? "Processing…" : `Pay ${inr(fare.total)}`}</Button>
      ) : (
        <Link to="/auth" className="text-sm text-primary underline">Sign in to book this fare</Link>
      )}
    </form>
  );
}
