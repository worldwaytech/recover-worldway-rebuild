import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageShell, PageHero } from "@/components/search-shell";
import {
  enquireEmptyLeg,
  listLiveEmptyLegs,
  type PublicEmptyLeg,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const HERO = "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80";

export const Route = createFileRoute("/private-aviation/empty-legs")({
  head: () => ({
    meta: [
      { title: "Live Empty Legs — Worldway Private Aviation" },
      { name: "description", content: "Live empty-leg private jet flights at up to 75% off full charter — aircraft, route, date, seats and price, updated continuously." },
      { property: "og:title", content: "Live Empty Legs — Worldway Private Aviation" },
      { property: "og:description", content: "Discounted one-way private jet repositioning flights, live from our operator network." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: HERO },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: HERO },
    ],
  }),
  component: EmptyLegsPage,
});

function EmptyLegsPage() {
  const listFn = useServerFn(listLiveEmptyLegs);
  const q = useQuery({ queryKey: ["live-empty-legs"], queryFn: () => listFn(), staleTime: 5 * 60_000 });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [pax, setPax] = useState(1);
  const [maxPrice, setMaxPrice] = useState("");
  const [selected, setSelected] = useState<PublicEmptyLeg | null>(null);
  const [visible, setVisible] = useState(24);

  const legs = q.data?.legs ?? [];
  const results = useMemo(() => {
    const f = from.trim().toLowerCase();
    const t = to.trim().toLowerCase();
    const mp = Number(maxPrice);
    return legs
      .filter((l) => {
        if (f && !`${l.originCode} ${l.originName}`.toLowerCase().includes(f)) return false;
        if (t && !`${l.destinationCode} ${l.destinationName}`.toLowerCase().includes(t)) return false;
        if (date && l.departureDate !== date) return false;
        if (l.seats != null && pax > l.seats) return false;
        if (mp > 0 && l.price != null && l.price > mp) return false;
        return true;
      })
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  }, [legs, from, to, date, pax, maxPrice]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Worldway Private Aviation · Empty Legs"
        title="Empty legs. Live. Up to 75% off."
        subtitle="One-way private jet repositioning flights from our vetted operator network — updated continuously."
        image={HERO}
      />

      <section className="mx-auto -mt-16 max-w-6xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">Search live empty legs</div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <AvLabel label="From (city, airport or code)"><input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="London, EGGW…" className={avField} /></AvLabel>
            <AvLabel label="To"><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Nice, LFMN…" className={avField} /></AvLabel>
            <AvLabel label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={avField} /></AvLabel>
            <AvLabel label="Passengers"><input type="number" min={1} max={40} value={pax} onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))} className={avField} /></AvLabel>
            <AvLabel label="Max price (USD)"><input type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" className={avField} /></AvLabel>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-6 pb-24">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-3xl">
            {q.isLoading ? "Loading live flights…" : `${results.length} live empty leg${results.length === 1 ? "" : "s"}`}
          </h2>
          <Link to="/private-jets" className="text-xs uppercase tracking-[0.3em] text-primary hover:underline">Need a full charter? Get an estimate →</Link>
        </div>

        {q.data && !q.data.ok && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">{q.data.error} Please try again shortly.</div>
        )}

        {!q.isLoading && q.data?.ok && results.length === 0 && (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-10 text-center text-sm text-muted-foreground">
            No empty legs match. Widen your search or <Link to="/private-jets" className="text-primary underline">request a charter estimate</Link>.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {results.slice(0, visible).map((l) => (
            <article key={l.id} className="flex flex-col rounded-2xl border border-border/60 bg-card/70 p-5 transition-colors hover:border-primary/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.3em] text-primary">{l.aircraft}</span>
                <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-primary">Live</span>
              </div>
              <div className="mt-3 font-serif text-xl leading-tight">
                {l.originName} <span className="text-muted-foreground">({l.originCode})</span>
                <span className="mx-2 text-primary">→</span>
                {l.destinationName} <span className="text-muted-foreground">({l.destinationCode})</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Info label="Date" value={l.departureDate ? new Date(l.departureDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
                <Info label="Time" value={`${l.departureTime ?? "—"}${l.arrivalTime ? ` → ${l.arrivalTime}` : ""}`} />
                <Info label="Duration" value={l.duration ?? "—"} />
                <Info label="Seats" value={l.seats != null ? String(l.seats) : "—"} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Whole aircraft</div>
                  <div className="font-serif text-2xl">{money(l.price, l.currency)}</div>
                </div>
                <button type="button" onClick={() => setSelected(l)} className="rounded-full bg-primary px-5 py-2 text-[11px] uppercase tracking-[0.25em] text-primary-foreground">
                  Enquire
                </button>
              </div>
            </article>
          ))}
        </div>
        {results.length > visible && (
          <div className="mt-8 text-center">
            <button onClick={() => setVisible((v) => v + 24)} className="rounded-full border border-border px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-primary">Show more</button>
          </div>
        )}
        <p className="mt-8 text-[11px] text-muted-foreground">
          Empty legs are one-off flights and can sell or change at short notice. Times are local. The price shown is for the whole aircraft; it is confirmed by our aviation desk before booking.
        </p>
      </section>

      <EnquiryDialog leg={selected} pax={pax} onClose={() => setSelected(null)} />
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function EnquiryDialog({ leg, pax, onClose }: { leg: PublicEmptyLeg | null; pax: number; onClose: () => void }) {
  const enquireFn = useServerFn(enquireEmptyLeg);
  const auth = useSignedInEmail();
  const [passengers, setPassengers] = useState(pax);
  const [contact, setContact] = useState<ContactValues>({ firstName: "", lastName: "", email: "", phone: "", specialRequests: "" });
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  function close() {
    setRef(null);
    setError(null);
    setOptIn(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leg) return;
    setBusy(true);
    setError(null);
    try {
      const r = await enquireFn({
        data: { legId: leg.id, passengers, ...contact, email: contact.email || auth.email || "", specialRequests: contact.specialRequests || undefined, optIn: true },
      });
      if (!r.ok) setError(r.error);
      else setRef(r.reference);
    } catch (err) {
      setError(err instanceof Response && err.status === 401 ? "Please sign in to continue." : "We couldn't send your enquiry. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!leg} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {leg ? `${leg.originCode} → ${leg.destinationCode} · ${leg.aircraft}` : ""}
          </DialogTitle>
        </DialogHeader>
        {ref ? (
          <div className="space-y-3 text-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-primary">Enquiry received</div>
            <p className="font-serif text-2xl">Worldway reference: {ref}</p>
            <p className="text-muted-foreground">Our Private Aviation desk is confirming this flight with the operator and will contact you with confirmed availability and a secure booking and payment link.</p>
            <Link to="/account" className="text-xs uppercase tracking-[0.3em] text-primary hover:underline">View in my account →</Link>
          </div>
        ) : !auth.ready ? null : !auth.email ? (
          <SignInPrompt what="enquire about this empty leg" />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {leg && (
              <p className="text-sm text-muted-foreground">
                {leg.departureDate} {leg.departureTime ?? ""} · {leg.seats ?? "?"} seats · {money(leg.price, leg.currency)}
              </p>
            )}
            <AvLabel label="Passengers">
              <input type="number" min={1} max={leg?.seats ?? 40} value={passengers} onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))} className={avField} />
            </AvLabel>
            <ContactFields value={contact} onChange={setContact} />
            <label className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              <span>Please confirm availability and final price for this flight with the operator.</span>
            </label>
            {error && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</div>}
            <div className="flex justify-end">
              <button disabled={!optIn || busy} className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-40">
                {busy ? "Sending…" : "Send enquiry"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
