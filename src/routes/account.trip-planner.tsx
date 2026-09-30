import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { assembleProposals } from "@/lib/engine/suppliers/proposals.functions";
import { Panel, EmptyState, fmtDate } from "@/components/account/account-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/account/trip-planner")({
  head: () => ({
    meta: [
      { title: "Trip Planner — Worldway Travels Group" },
      { name: "description", content: "Build a live trip plan: flights, hotels and tours checked live, with optional stays around your tour." },
      { property: "og:title", content: "Trip Planner — Worldway Travels Group" },
      { property: "og:description", content: "Live flights, hotels and tours in one chronological trip plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripPlanner,
});

type Money = { amount: number; currency: string } | null;
const money = (m: Money) => (m ? new Intl.NumberFormat("en", { style: "currency", currency: m.currency }).format(m.amount) : "Price on request");
const when = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

function TripPlanner() {
  const plan = useServerFn(assembleProposals);
  const [form, setForm] = useState({ origin: "", destination: "", departFrom: "", returnBy: "", adults: 2, children: 0 });
  const [tourQuery, setTourQuery] = useState("");
  const [tourRef, setTourRef] = useState<string | undefined>();
  const run = useMutation({
    mutationFn: (v: { tourRef?: string; tourQuery?: string }) =>
      plan({
        data: {
          requirements: {
            origin: form.origin.trim().toUpperCase(), destinations: [form.destination.trim().toUpperCase()], departFrom: form.departFrom, returnBy: form.returnBy,
            adults: form.adults, children: form.children, luxuryLevel: 4, interests: [],
          },
          save: false, tourRef: v.tourRef, tourQuery: v.tourQuery || undefined,
        },
      }),
  });
  const r = run.data;
  const go = (next: { tourRef?: string; tourQuery?: string }) => { setTourRef(next.tourRef); run.mutate(next); };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: k === "adults" || k === "children" ? Number(e.target.value) : e.target.value });

  return (
    <div className="space-y-6">
      <Panel title="Plan your trip" description="Flights, hotels and tours are checked live. Hotel and tour dates start on the day you actually land.">
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); go({}); }}>
          <div><Label>From (airport code)</Label><Input required maxLength={3} placeholder="DEL" value={form.origin} onChange={set("origin")} /></div>
          <div><Label>To (airport code)</Label><Input required maxLength={3} placeholder="IST" value={form.destination} onChange={set("destination")} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Adults</Label><Input type="number" min={1} max={9} value={form.adults} onChange={set("adults")} /></div>
            <div><Label>Children</Label><Input type="number" min={0} max={8} value={form.children} onChange={set("children")} /></div>
          </div>
          <div><Label>Depart</Label><Input required type="date" value={form.departFrom} onChange={set("departFrom")} /></div>
          <div><Label>Return</Label><Input required type="date" value={form.returnBy} onChange={set("returnBy")} /></div>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={run.isPending}>{run.isPending ? "Checking live…" : "Build trip plan"}</Button></div>
        </form>
        {run.isError && <p className="mt-3 text-sm text-destructive">We couldn't build this plan right now. Please try again.</p>}
      </Panel>

      {r && (
        <>
          {r.arrivalDate && <p className="text-sm text-muted-foreground">You land on <strong className="text-foreground">{fmtDate(r.arrivalDate)}</strong> — hotels and tours start from this date.</p>}

          <Panel title="Choose a tour" description="Live tours that fit between your arrival and your flight home. Booking is confirmed by our team.">
            <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); go({ tourRef, tourQuery }); }}>
              <Input placeholder="Search tours by name…" value={tourQuery} onChange={(e) => setTourQuery(e.target.value)} />
              <Button type="submit" variant="outline" disabled={run.isPending}>Search</Button>
              {r.selectedTour && <Button type="button" variant="ghost" disabled={run.isPending} onClick={() => go({ tourQuery })}>Remove tour</Button>}
            </form>
            {r.selectedTour && (
              <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
                <div className="font-medium">Selected: {r.selectedTour.title}</div>
                <div className="text-muted-foreground">{fmtDate(r.selectedTour.startDate!)} – {fmtDate(r.selectedTour.endDate!)} · {money(r.selectedTour.price)}</div>
                {r.selectedTour.coversNights
                  ? <div className="mt-1">Accommodation is included from {fmtDate(r.selectedTour.coversNights.checkin)} to {fmtDate(r.selectedTour.coversNights.checkout)}, so no hotel is added for those nights.</div>
                  : <div className="mt-1">This tour doesn't include accommodation, so your hotel stays in the plan.</div>}
              </div>
            )}
            {r.tours.length === 0 ? <EmptyState title="No live tours fit these dates" hint="Try other dates or another search." /> : (
              <div className="grid gap-3 sm:grid-cols-2">
                {r.tours.map((t) => (
                  <div key={t.ref} className="rounded-xl border border-border/60 p-4">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{fmtDate(t.startDate!)}{t.endDate !== t.startDate ? ` – ${fmtDate(t.endDate!)}` : ""}{t.durationDays ? ` · ${t.durationDays} day${t.durationDays > 1 ? "s" : ""}` : ""}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">Live price</Badge>
                      {t.accommodationIncluded && <Badge variant="outline">Accommodation included</Badge>}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-medium">{money(t.price)}</span>
                      <Button size="sm" disabled={run.isPending || r.selectedTour?.ref === t.ref} onClick={() => go({ tourRef: t.ref, tourQuery })}>
                        {r.selectedTour?.ref === t.ref ? "Selected" : "Choose tour"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Your trip plan" description="In order of travel. Prices are re-checked live before anything can be booked.">
            {r.proposals.length === 0 ? <EmptyState title="No live plan for these dates" hint={r.sources.find((s) => s.error)?.error ?? "Try different dates."} /> : (
              <div className="space-y-6">
                {r.proposals.slice(0, 2).map((p, i) => (
                  <div key={i} className="rounded-xl border border-border/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-medium">Option {i + 1}</div>
                      <div className="text-sm">{p.total != null ? <>Total <strong>{money({ amount: p.total, currency: p.currency })}</strong></> : <span className="text-muted-foreground">Total not available yet</span>}</div>
                    </div>
                    <ol className="space-y-2 text-sm">
                      {p.components.map((c, j) => (
                        <li key={j} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-2">
                          <span><Badge variant="outline" className="mr-2 capitalize">{c.kind === "stay" ? "hotel" : c.kind === "activity" ? "tour" : c.kind}</Badge>{c.title}</span>
                          <span className="text-muted-foreground">{when(c.start.at, c.start.timezone)} → {when(c.end.at, c.end.timezone)}</span>
                        </li>
                      ))}
                    </ol>
                    {p.total == null && p.blockers.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Why: {p.blockers.slice(0, 2).join("; ")}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">Nothing is booked or charged. Our team confirms availability before booking.</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Optional stays" description="Extra nights before or after your tour. Not included in your plan or total unless you ask for them.">
            {r.optionalStays.length === 0 ? <EmptyState title="No optional stays for this plan" hint="These appear around tours that include accommodation." /> : (
              <div className="space-y-4">
                {r.optionalStays.map((o, i) => (
                  <div key={i} className="rounded-xl border border-dashed border-border p-4">
                    <div className="text-sm font-medium">{o.position === "pre-tour" ? "Before" : "After"} “{o.tourTitle}” · {fmtDate(o.checkin)} – {fmtDate(o.checkout)}</div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {o.hotels.map((h, j) => <li key={j} className="flex justify-between gap-2"><span>{h.title}</span><span className="text-muted-foreground">{money(h.price)}</span></li>)}
                    </ul>
                    <Badge variant="secondary" className="mt-2">Optional — not in your total</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
