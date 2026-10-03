import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portal, type PortalUser } from "@/lib/portal-store";
import {
  TRIPSAFE_AMT_DURATIONS,
  TRIPSAFE_NOMINEE_RELATIONS,
  TRIPSAFE_POPULAR_REGIONS,
  TRIPSAFE_STUDENT_DURATIONS,
  type TripsafeChannelType,
} from "@/lib/tripjack/config";
import type { TripsafePlanSummary, TripsafeTraveller } from "@/lib/tripjack/tripsafe-contract";
import {
  createTripsafeBooking,
  reviewTripsafePlan,
  searchTripsafePlans,
} from "@/lib/tripjack/tripjack.functions";

type Plan = TripsafePlanSummary;

const CHANNELS: Array<{ key: TripsafeChannelType; label: string; blurb: string }> = [
  { key: "REGULAR", label: "Single trip", blurb: "Cover for one journey of up to 90 days." },
  { key: "STUDENT", label: "Student", blurb: "Long-stay study cover, ages 18–45, 6 months to 3 years." },
  { key: "AMT", label: "Annual multi-trip", blurb: "Unlimited trips for 12 months, worldwide or excl. US & Canada." },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const emptyTraveller = (id: number, age: number): TripsafeTraveller => ({
  id,
  ti: "Mr",
  fn: "",
  ln: "",
  age,
  dob: "",
  eid: "",
  cnum: "",
  pnum: "",
  pincode: "",
  gen: "M",
  isio: id === 1,
  nomineeName: "",
  nomineeRelation: "SPOUSE",
});

export function TripsafeBooking({ enabled }: { enabled: boolean }) {
  const nav = useNavigate();
  const search = useServerFn(searchTripsafePlans);
  const review = useServerFn(reviewTripsafePlan);
  const book = useServerFn(createTripsafeBooking);

  const [me, setMe] = useState<PortalUser | null>(null);
  useEffect(() => {
    setMe(portal.session());
    return portal.subscribe(() => setMe(portal.session()));
  }, []);

  const [channel, setChannel] = useState<TripsafeChannelType>("REGULAR");
  const [regionMode, setRegionMode] = useState<"POPULARREGION" | "COUNTRY">("POPULARREGION");
  const [regions, setRegions] = useState<string[]>(["SCH"]);
  const [countries, setCountries] = useState("");
  const [sd, setSd] = useState(() => iso(new Date(Date.now() + 7 * 86_400_000)));
  const [ed, setEd] = useState(() => iso(new Date(Date.now() + 21 * 86_400_000)));
  const [studentDays, setStudentDays] = useState<number>(180);
  const [amtDays, setAmtDays] = useState<number>(30);
  const [ages, setAges] = useState<number[]>([32]);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [travellers, setTravellers] = useState<TripsafeTraveller[]>([]);
  const [reviewed, setReviewed] = useState<{ bid: string; totalFare: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; status: string; message: string; policyIds: string[] } | null>(null);
  const idem = useMemo(() => crypto.randomUUID(), [selected]);

  const iri = () =>
    regionMode === "POPULARREGION"
      ? regions.map((rkey) => ({ rkey, rt: "POPULARREGION" as const }))
      : countries
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter((c) => c.length === 2)
          .map((rkey) => ({ rkey, rt: "COUNTRY" as const }));

  const runSearch = async () => {
    const regionsSel = iri();
    if (!regionsSel.length) return toast.error("Choose at least one destination.");
    setSearching(true);
    setPlans(null);
    setSelected(null);
    setReviewed(null);
    setDone(null);
    const isq = {
      sd,
      ed: channel === "STUDENT" ? undefined : channel === "AMT" ? iso(new Date(Date.parse(sd) + 365 * 86_400_000)) : ed,
      cd: channel === "STUDENT" ? String(studentDays) : undefined,
      adr: channel === "AMT" ? String(amtDays) : undefined,
      ict: channel === "REGULAR" ? undefined : channel,
      isc: { iri: regionsSel },
      iti: ages.map((age) => ({ age })),
    };
    const r = await search({ data: { isq } });
    setSearching(false);
    if (!r.ok) return toast.error(r.message);
    setPlans(r.data.plans);
    if (!r.data.plans.length) toast.message("No plans returned for this search.");
  };

  const choose = (p: Plan) => {
    setSelected(p);
    setReviewed(null);
    setTravellers(ages.map((age, i) => emptyTraveller(i + 1, age)));
  };

  const selectionPayload = () => ({
    plid: selected!.plid,
    pid: selected!.pid,
    sd,
    ed: channel === "STUDENT" ? undefined : channel === "AMT" ? iso(new Date(Date.parse(sd) + 365 * 86_400_000)) : ed,
    cd: channel === "STUDENT" ? String(studentDays) : undefined,
    iti: travellers.map((t) => ({
      ...t,
      eid: t.eid || undefined,
      cnum: t.cnum || undefined,
      pnum: t.pnum || undefined,
      pincode: t.pincode || undefined,
      nomineeName: t.nomineeName || undefined,
      nomineeRelation: t.nomineeRelation as (typeof TRIPSAFE_NOMINEE_RELATIONS)[number] | undefined,
    })),
  });

  const validTravellers = () =>
    travellers.every((t) => t.fn && t.ln && /^\d{4}-\d{2}-\d{2}$/.test(t.dob) && t.gen && t.nomineeName && t.nomineeRelation) &&
    Boolean(travellers[0]?.eid && travellers[0]?.cnum);

  const runReview = async () => {
    if (!selected) return;
    setBusy(true);
    const r = await review({ data: { plid: selected.plid, pid: selected.pid } });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    setReviewed(r.data);
    toast.success("Plan re-priced with the insurer.");
  };

  const runBook = async () => {
    if (!me) return nav({ to: "/auth" });
    if (!selected || !reviewed) return;
    if (!validTravellers()) {
      return toast.error("Every traveller needs a real name, date of birth, gender and nominee; the lead traveller needs email and mobile.");
    }
    setBusy(true);
    try {
      const r = await book({ data: { idempotencyKey: idem, planName: selected.name, selection: selectionPayload() } });
      setDone({ reference: r.booking.reference, status: r.booking.status, message: r.message, policyIds: r.booking.policyIds });
      if (r.booking.status === "failed") toast.error(r.message);
      else toast.success(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChannel(c.key)}
              className={`rounded-xl border p-4 text-left transition ${
                channel === c.key ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              }`}
            >
              <p className="font-medium">{c.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.blurb}</p>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Destination</Label>
            <div className="mt-2 flex gap-2 text-sm">
              <button type="button" className={regionMode === "POPULARREGION" ? "underline" : "text-muted-foreground"} onClick={() => setRegionMode("POPULARREGION")}>Regions</button>
              <span aria-hidden>·</span>
              <button type="button" className={regionMode === "COUNTRY" ? "underline" : "text-muted-foreground"} onClick={() => setRegionMode("COUNTRY")}>Countries</button>
            </div>
            {regionMode === "POPULARREGION" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {TRIPSAFE_POPULAR_REGIONS.map((r) => {
                  const on = regions.includes(r.rkey);
                  return (
                    <button
                      key={r.rkey}
                      type="button"
                      onClick={() => setRegions(on ? regions.filter((x) => x !== r.rkey) : [...regions, r.rkey])}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Input className="mt-2" placeholder="ISO country codes, e.g. AE, GB, US" value={countries} onChange={(e) => setCountries(e.target.value)} />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Start date</Label>
              <Input type="date" className="mt-2" value={sd} onChange={(e) => setSd(e.target.value)} />
            </div>
            {channel === "REGULAR" && (
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">End date</Label>
                <Input type="date" className="mt-2" value={ed} onChange={(e) => setEd(e.target.value)} />
              </div>
            )}
            {channel === "STUDENT" && (
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Duration</Label>
                <select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={studentDays} onChange={(e) => setStudentDays(Number(e.target.value))}>
                  {TRIPSAFE_STUDENT_DURATIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            )}
            {channel === "AMT" && (
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Max days per trip</Label>
                <select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={amtDays} onChange={(e) => setAmtDays(Number(e.target.value))}>
                  {TRIPSAFE_AMT_DURATIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Traveller ages</Label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ages.map((a, i) => (
              <Input key={i} type="number" min={0} max={70} className="w-20" value={a} aria-label={`Traveller ${i + 1} age`} onChange={(e) => setAges(ages.map((x, j) => (j === i ? Number(e.target.value) || 0 : x)))} />
            ))}
            {ages.length < 10 && <Button type="button" variant="outline" size="sm" onClick={() => setAges([...ages, 30])}>Add traveller</Button>}
            {ages.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setAges(ages.slice(0, -1))}>Remove</Button>}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={runSearch} disabled={!enabled || searching}>{searching ? "Searching plans…" : "Search plans"}</Button>
          {!enabled && <p className="text-sm text-muted-foreground">Live quoting is unavailable until the supplier channel is configured.</p>}
        </div>
      </div>

      {plans && plans.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="font-display text-2xl">Available plans</h2>
          {plans.map((p) => (
            <article key={`${p.plid}-${p.pid}`} className={`rounded-xl border p-5 ${selected?.pid === p.pid ? "border-primary" : "border-border"}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex-1">
                  <h3 className="text-lg font-medium">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{[p.insurer, p.region].filter(Boolean).join(" · ")}</p>
                  {p.benefits.length > 0 && (
                    <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {p.benefits.slice(0, 6).map((b, i) => <li key={i}>{b.name}{b.value ? `: ${b.value}` : ""}</li>)}
                    </ul>
                  )}
                </div>
                <div className="text-right">
                  {p.totalFare != null ? (
                    <>
                      <p className="text-2xl font-semibold">₹{p.totalFare.toLocaleString("en-IN")}</p>
                      <p className="text-[11px] text-muted-foreground">indicative · confirmed at review</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Price on review</p>
                  )}
                  <Button size="sm" className="mt-2" variant={selected?.pid === p.pid ? "default" : "outline"} onClick={() => choose(p)}>
                    {selected?.pid === p.pid ? "Selected" : "Select"}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && !done && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-2xl">Traveller details</h2>
          <p className="mt-1 text-xs text-muted-foreground">Names must match travel documents — the insurer rejects placeholder names.</p>
          <div className="mt-4 space-y-6">
            {travellers.map((t, i) => (
              <fieldset key={i} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-3">
                <legend className="px-1 text-sm font-medium">Traveller {i + 1}{i === 0 ? " (lead)" : ""}</legend>
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={t.ti} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, ti: e.target.value } : x)))}>
                  {["Mr", "Ms", "Mrs", "Master", "Miss"].map((o) => <option key={o}>{o}</option>)}
                </select>
                <Input placeholder="First name" value={t.fn} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, fn: e.target.value } : x)))} />
                <Input placeholder="Last name" value={t.ln} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, ln: e.target.value } : x)))} />
                <Input type="date" aria-label="Date of birth" value={t.dob} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, dob: e.target.value } : x)))} />
                <select aria-label="Gender" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={t.gen ?? "M"} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, gen: e.target.value as "M" | "F" } : x)))}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
                <Input placeholder="Passport number" value={t.pnum} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, pnum: e.target.value } : x)))} />
                <Input placeholder="Nominee name" value={t.nomineeName} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, nomineeName: e.target.value } : x)))} />
                <select aria-label="Nominee relation" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={t.nomineeRelation ?? "SPOUSE"} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, nomineeRelation: e.target.value } : x)))}>
                  {TRIPSAFE_NOMINEE_RELATIONS.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                </select>
                <Input placeholder="Pincode" value={t.pincode} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, pincode: e.target.value } : x)))} />
                {i === 0 && (
                  <>
                    <Input type="email" placeholder="Email (policy delivery)" value={t.eid} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, eid: e.target.value } : x)))} />
                    <Input placeholder="Mobile number (policy delivery)" value={t.cnum} onChange={(e) => setTravellers(travellers.map((x, j) => (j === i ? { ...x, cnum: e.target.value } : x)))} />
                  </>
                )}
              </fieldset>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {!reviewed ? (
              <Button onClick={runReview} disabled={busy}>{busy ? "Re-pricing…" : "Review & re-price"}</Button>
            ) : (
              <>
                <Button onClick={runBook} disabled={busy}>{busy ? "Issuing…" : me ? "Confirm & issue policy" : "Sign in to book"}</Button>
                <p className="text-sm text-muted-foreground">
                  Total ₹{reviewed.totalFare.toLocaleString("en-IN")} · insurer ref {reviewed.bid}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {done && (
        <div className="mt-8 rounded-2xl border border-primary/40 bg-card p-6">
          <h2 className="font-display text-2xl">Policy request {done.reference}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Status: <span className="font-medium text-foreground">{done.status}</span> · {done.message}</p>
          {done.policyIds.length > 0 && (
            <p className="mt-2 text-sm">Policy {done.policyIds.length > 1 ? "numbers" : "number"}: <span className="font-medium">{done.policyIds.join(", ")}</span></p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Cancellations must be raised at least 24 hours before the coverage start date.</p>
          <Button variant="ghost" className="mt-4" onClick={() => nav({ to: "/account/trips" })}>View in my trips</Button>
        </div>
      )}
    </section>
  );
}
