import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRazorpayCheckout } from "@/components/payments/use-razorpay";
import { useMemo, useState } from "react";
import { getTourDetail, getTourLiveAvailability, getTourLiveQuote, requestTourBooking } from "@/lib/travelshop/tours.functions";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/marketplace/$id")({
  head: ({ params }) => {
    const name = params.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} — Worldway Tours` },
        { name: "description", content: `Itinerary, inclusions, live availability and pricing for ${name}.` },
        { property: "og:title", content: `${name} — Worldway Tours` },
        { property: "og:description", content: `Live availability and pricing for ${name}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: TourDetailPage,
});

const today = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const box = "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

function TourDetailPage() {
  const { id: slug } = Route.useParams();
  const { data: t, isLoading } = useQuery({ queryKey: ["tour", slug], queryFn: () => getTourDetail({ data: { slug } }) });
  const [from, setFrom] = useState(today());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const pax = adults + children;
  const avail = useQuery({
    queryKey: ["tour-avail", slug, from, pax],
    queryFn: () => getTourLiveAvailability({ data: { slug, from, pax } }),
    enabled: !!t,
  });
  const [pick, setPick] = useState<{ date: string; service: "private" | "regular" } | null>(null);
  const quote = useQuery({
    queryKey: ["tour-quote", slug, pick, adults, children, infants],
    queryFn: () => getTourLiveQuote({ data: { slug, date: pick!.date, service: pick!.service, adults, children, infants } }),
    enabled: !!pick,
  });
  const dates = useMemo(() => (avail.data?.dates ?? []).slice(0, 40), [avail.data]);

  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">Loading…</main>;
  if (!t) return <main className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">Tour not found. <Link to="/marketplace" className="underline">Back to marketplace</Link></main>;
  const d = (t.details ?? {}) as { guide?: string; physicalRating?: string; pickupTime?: string; reviews?: Array<{ name: string; title: string; content: string }> };
  const images = (t.images ?? []) as Array<{ url: string; alt: string | null }>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/marketplace" className="text-sm text-muted-foreground underline">← All tours</Link>
      {t.cover_image && <img src={mediaUrl(t.cover_image)} alt={t.name} className="mt-4 h-80 w-full rounded-xl object-cover" />}
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.slice(1, 10).map((im) => <img key={im.url} src={mediaUrl(im.url)} alt={im.alt ?? t.name} className="h-20 w-32 flex-none rounded-md object-cover" loading="lazy" />)}
        </div>
      )}
      <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground">{t.category_name}</p>
      <h1 className="text-3xl font-semibold text-foreground">{t.name}</h1>
      <p className="mt-1 text-muted-foreground">
        {[t.start_location, t.country].filter(Boolean).join(", ")}
        {t.duration_days ? ` · ${t.duration_days} day${t.duration_days > 1 ? "s" : ""}` : ""}
        {t.rating ? ` · ★ ${Number(t.rating).toFixed(1)} (${t.review_count})` : ""}
        {t.is_private ? " · Private" : ""}{t.is_regular ? " · Small group" : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {t.free_cancellation && <span className="rounded bg-muted px-2 py-1">Free cancellation</span>}
        {t.instant_confirmation && <span className="rounded bg-muted px-2 py-1">Instant confirmation</span>}
        {d.guide && <span className="rounded bg-muted px-2 py-1">{d.guide}</span>}
        {d.physicalRating && <span className="rounded bg-muted px-2 py-1">Activity level: {d.physicalRating}</span>}
        {t.languages?.map((l: string) => <span key={l} className="rounded bg-muted px-2 py-1">{l}</span>)}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {t.summary && <p className="whitespace-pre-line text-foreground">{t.summary}</p>}
          {t.highlights?.length > 0 && (
            <section><h2 className="text-xl font-semibold text-foreground">Highlights</h2>
              <ul className="mt-2 list-disc pl-5 text-foreground">{(t.highlights as string[]).map((h) => <li key={h}>{h}</li>)}</ul></section>
          )}
          {t.itinerary?.length > 0 && (
            <section><h2 className="text-xl font-semibold text-foreground">Itinerary</h2>
              <ol className="mt-2 space-y-4">{(t.itinerary as Array<{ day: number | null; title: string | null; description: string }>).map((i, k) => (
                <li key={k}><p className="font-medium text-foreground">{i.day ? `Day ${i.day}: ` : ""}{i.title}</p><p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{i.description}</p></li>
              ))}</ol></section>
          )}
          <section className="grid gap-6 sm:grid-cols-2">
            <div><h2 className="text-lg font-semibold text-foreground">Included</h2><ul className="mt-2 list-disc pl-5 text-sm text-foreground">{(t.inclusions as string[]).map((x) => <li key={x}>{x}</li>)}{t.inclusions.length === 0 && <li className="list-none text-muted-foreground">Not specified</li>}</ul></div>
            <div><h2 className="text-lg font-semibold text-foreground">Not included</h2><ul className="mt-2 list-disc pl-5 text-sm text-foreground">{(t.exclusions as string[]).map((x) => <li key={x}>{x}</li>)}{t.exclusions.length === 0 && <li className="list-none text-muted-foreground">Not specified</li>}</ul></div>
          </section>
          {d.reviews && d.reviews.length > 0 && (
            <section><h2 className="text-xl font-semibold text-foreground">Traveller reviews</h2>
              <div className="mt-2 space-y-3">{d.reviews.map((r, k) => <div key={k} className="rounded-lg border border-border p-3"><p className="font-medium text-foreground">{r.title}</p><p className="mt-1 text-sm text-muted-foreground">{r.content}</p><p className="mt-1 text-xs text-muted-foreground">— {r.name}</p></div>)}</div></section>
          )}
        </div>

        <aside className="h-fit space-y-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">Live availability</h2>
          <label className="block text-sm text-muted-foreground">From date
            <input type="date" min={today()} value={from} onChange={(e) => { setFrom(e.target.value); setPick(null); }} className={`${box} mt-1 w-full`} /></label>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <label>Adults<input type="number" min={1} max={60} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))} className={`${box} mt-1 w-full`} /></label>
            <label>Children<input type="number" min={0} max={30} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))} className={`${box} mt-1 w-full`} /></label>
            <label>Infants<input type="number" min={0} max={10} value={infants} onChange={(e) => setInfants(Math.max(0, Number(e.target.value)))} className={`${box} mt-1 w-full`} /></label>
          </div>
          {avail.isLoading && <p className="text-sm text-muted-foreground">Checking live availability…</p>}
          {avail.data?.error && <p className="text-sm text-destructive">{avail.data.error}</p>}
          {avail.data && !avail.data.error && dates.length === 0 && <p className="text-sm text-muted-foreground">No open departures from this date. Try a later date.</p>}
          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
            {dates.map((x) => {
              const on = pick?.date === x.date && pick.service === x.service;
              return (
                <button key={`${x.date}-${x.service}`} onClick={() => setPick({ date: x.date, service: x.service })}
                  className={`rounded-md border px-2 py-1 text-left text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
                  {x.date} · {x.service === "private" ? "Private" : "Group"}<br />{x.currency} {(x.perAdult || x.perUnit).toFixed(0)}{x.perAdult ? " pp" : ""}
                </button>
              );
            })}
          </div>
          {pick && (
            <div className="border-t border-border pt-3">
              {quote.isLoading && <p className="text-sm text-muted-foreground">Confirming live price…</p>}
              {quote.data && !quote.data.ok && <p className="text-sm text-destructive">{quote.data.reason}</p>}
              {quote.data?.ok && (
                <>
                  <p className="text-xs text-muted-foreground">Live price · checked {new Date(quote.data.checkedAt).toLocaleTimeString()}</p>
                  <p className="text-2xl font-semibold text-foreground">{quote.data.currency} {quote.data.total.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Total for {adults} adult{adults > 1 ? "s" : ""}{children ? `, ${children} child` : ""}{infants ? `, ${infants} infant` : ""}</p>
                  <BookingForm slug={slug} pick={pick} adults={adults} children={children} infants={infants} />
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function BookingForm(p: { slug: string; pick: { date: string; service: "private" | "regular" }; adults: number; children: number; infants: number }) {
  const submit = useServerFn(requestTourBooking);
  const { pay, busy: paying, error: payError } = useRazorpayCheckout();
  const [lead, setLead] = useState({ title: "Mr" as "Mr" | "Mrs" | "Ms" | "Miss" | "Dr", firstName: "", lastName: "", email: "", phoneCountryCode: "+", phone: "" });
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<{ busy: boolean; msg?: string; ok?: boolean; payable?: { id: string; currency: string; total: number } }>({ busy: false });
  const [done, setDone] = useState<string | null>(null);
  async function onPay() {
    if (!state.payable) return;
    const r = await pay({ purpose: "tour", tourBookingId: state.payable.id, currency: state.payable.currency, description: "Worldway tour booking", name: `${lead.firstName} ${lead.lastName}`, email: lead.email, phone: lead.phone });
    if (r) setDone("Payment received. Your tour is being confirmed — you'll see the confirmation in your bookings, and our team will contact you if anything needs attention.");
  }
  return (
    <form className="mt-3 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setState({ busy: true });
      try {
        const r = await submit({ data: { slug: p.slug, date: p.pick.date, service: p.pick.service, adults: p.adults, children: p.children, infants: p.infants, lead: { ...lead, phoneCountryCode: lead.phoneCountryCode.length > 1 ? lead.phoneCountryCode : undefined }, specialRequests: notes || undefined } });
        if (!r.ok) { setState({ busy: false, msg: r.reason }); return; }
        const total = Number(r.booking.customer_total);
        setState(r.payable
          ? { busy: false, ok: true, payable: { id: r.booking.id as string, currency: r.booking.customer_currency as string, total }, msg: `Live price confirmed: ${r.booking.customer_currency} ${total.toFixed(2)}.` }
          : { busy: false, ok: true, msg: `Request saved — ${r.booking.customer_currency} ${total.toFixed(2)}, live price re-checked. Our team will confirm your booking and send the payment link. Nothing has been charged.` });
      } catch {
        setState({ busy: false, msg: "Please sign in to book, then try again." });
      }
    }}>
      <div className="grid grid-cols-[5rem_1fr_1fr] gap-2">
        <select aria-label="Title" className={box} value={lead.title} onChange={(e) => setLead({ ...lead, title: e.target.value as typeof lead.title })}>{["Mr", "Mrs", "Ms", "Miss", "Dr"].map((t) => <option key={t}>{t}</option>)}</select>
        <input required placeholder="First name" className={box} value={lead.firstName} onChange={(e) => setLead({ ...lead, firstName: e.target.value })} />
        <input required placeholder="Last name" className={box} value={lead.lastName} onChange={(e) => setLead({ ...lead, lastName: e.target.value })} />
      </div>
      <input required type="email" placeholder="Email" className={`${box} w-full`} value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <input required aria-label="Country code" placeholder="+44" className={box} value={lead.phoneCountryCode} onChange={(e) => setLead({ ...lead, phoneCountryCode: e.target.value })} />
        <input required placeholder="Phone" className={box} value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
      </div>
      <textarea placeholder="Special requests (optional)" maxLength={1000} className={`${box} w-full`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!state.payable ? (
        <button disabled={state.busy || state.ok} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{state.busy ? "Re-checking live price…" : "Continue"}</button>
      ) : (
        <button type="button" onClick={onPay} disabled={paying || !!done} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{paying ? "Processing…" : `Pay ${state.payable.currency} ${state.payable.total.toFixed(2)} and book`}</button>
      )}
      {state.msg && <p className={`text-sm ${state.ok ? "text-primary" : "text-destructive"}`}>{state.msg}</p>}
      {done && <p className="text-sm text-primary">{done}</p>}
      {payError && !done && <p className="text-sm text-destructive">{payError}</p>}
    </form>
  );
}
