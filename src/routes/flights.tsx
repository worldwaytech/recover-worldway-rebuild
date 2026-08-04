import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero, SearchCard, ResultsPanel, Field } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { searchFlights } from "@/lib/wwl.functions";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "@/components/membership-upgrade-dialog";

export const Route = createFileRoute("/flights")({
  head: () => ({
    meta: [
      { title: "Flights — Worldway Travels Group" },
      {
        name: "description",
        content: "One-way, round-trip and multi-city flights across the world's finest cabins.",
      },
    ],
  }),
  component: FlightsPage,
});

type Trip = "one_way" | "round_trip" | "multi_city";
type Leg = { origin: string; destination: string; date: string };

const TRIP_TABS: { key: Trip; label: string }[] = [
  { key: "one_way", label: "One Way" },
  { key: "round_trip", label: "Round Trip" },
  { key: "multi_city", label: "Multi-City" },
];

function FlightsPage() {
  const runFlightSearch = useServerFn(searchFlights);
  const [trip, setTrip] = useState<Trip>("round_trip");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [depart, setDepart] = useState("");
  const [ret, setRet] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabin, setCabin] = useState("business");
  const [legs, setLegs] = useState<Leg[]>([
    { origin: "", destination: "", date: "" },
    { origin: "", destination: "", date: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [gate, setGate] = useState(false);

  function updateLeg(i: number, patch: Partial<Leg>) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLeg() {
    if (legs.length >= 6) return;
    setLegs((prev) => [...prev, { origin: "", destination: "", date: "" }]);
  }
  function removeLeg(i: number) {
    if (legs.length <= 2) return;
    setLegs((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    window.dispatchEvent(new Event("wwtg:search-submit"));
    if (!portal.canSearch()) {
      setGate(true);
      return;
    }
    setError(null);
    if (trip === "multi_city") {
      const valid = legs.filter((l) => l.origin && l.destination && l.date);
      if (valid.length < 2) {
        setError("Please fill origin, destination and date for at least two legs.");
        return;
      }
    } else if (!origin || !destination || !depart) {
      setError("Please fill origin, destination and departure date.");
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const payload: Record<string, unknown> = { passengers, cabin, trip_type: trip };
      if (trip === "multi_city") {
        payload.legs = legs
          .filter((l) => l.origin && l.destination && l.date)
          .map((l) => ({ origin: l.origin, destination: l.destination, date: l.date }));
      } else {
        payload.origin = origin;
        payload.destination = destination;
        payload.depart_date = depart;
        if (trip === "round_trip" && ret) payload.return_date = ret;
      }
      const res = await runFlightSearch({ data: payload });
      if (!res.ok) setError(res.error ?? "Request failed");
      else {
        portal.recordSearch();
        setData(res.data ?? { message: "Search completed." });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Flights"
        title="First-class itineraries, quietly arranged."
        subtitle="One-way, round-trip and multi-city — live airport data with IATA codes."
        image="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchCard title="Flight Search">
        <div className="mb-5 flex flex-wrap gap-2">
          {TRIP_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTrip(t.key)}
              className={`rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] transition ${
                trip === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          {trip !== "multi_city" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label="From">
                <LocationAutocomplete
                  name="origin_visible"
                  kind="airports"
                  required
                  placeholder="JFK, London Heathrow…"
                  onChange={setOrigin}
                  onSelect={(r) => setOrigin(r.iata ?? r.city ?? "")}
                />
              </Field>
              <Field label="To">
                <LocationAutocomplete
                  name="destination_visible"
                  kind="airports"
                  required
                  placeholder="LHR, Paris CDG…"
                  onChange={setDestination}
                  onSelect={(r) => setDestination(r.iata ?? r.city ?? "")}
                />
              </Field>
              <Field label="Departure">
                <input
                  type="date"
                  required
                  value={depart}
                  onChange={(e) => setDepart(e.target.value)}
                  className={inputClass}
                />
              </Field>
              {trip === "round_trip" ? (
                <Field label="Return">
                  <input
                    type="date"
                    value={ret}
                    onChange={(e) => setRet(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              ) : null}
              <Field label="Passengers">
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value) || 1)}
                  className={inputClass}
                />
              </Field>
              <Field label="Cabin">
                <select
                  value={cabin}
                  onChange={(e) => setCabin(e.target.value)}
                  className={inputClass}
                >
                  <option value="economy">Economy</option>
                  <option value="premium_economy">Premium Economy</option>
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              </Field>
            </div>
          ) : (
            <div className="space-y-4">
              {legs.map((leg, i) => (
                <div
                  key={i}
                  className="grid gap-4 rounded-xl border border-border/50 bg-background/30 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Field label={`Leg ${i + 1} From`}>
                    <LocationAutocomplete
                      name={`leg${i}_from`}
                      kind="airports"
                      required
                      placeholder="Airport"
                      onChange={(value) => updateLeg(i, { origin: value })}
                      onSelect={(r) => updateLeg(i, { origin: r.iata ?? r.city ?? "" })}
                    />
                  </Field>
                  <Field label="To">
                    <LocationAutocomplete
                      name={`leg${i}_to`}
                      kind="airports"
                      required
                      placeholder="Airport"
                      onChange={(value) => updateLeg(i, { destination: value })}
                      onSelect={(r) => updateLeg(i, { destination: r.iata ?? r.city ?? "" })}
                    />
                  </Field>
                  <Field label="Date">
                    <input
                      type="date"
                      required
                      value={leg.date}
                      onChange={(e) => updateLeg(i, { date: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeLeg(i)}
                      disabled={legs.length <= 2}
                      className="rounded-full border border-border px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={addLeg}
                  disabled={legs.length >= 6}
                  className="rounded-full border border-primary/60 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-primary disabled:opacity-40"
                >
                  + Add another leg
                </button>
                <div className="flex flex-wrap gap-4">
                  <Field label="Passengers">
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={passengers}
                      onChange={(e) => setPassengers(Number(e.target.value) || 1)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Cabin">
                    <select
                      value={cabin}
                      onChange={(e) => setCabin(e.target.value)}
                      className={inputClass}
                    >
                      <option value="economy">Economy</option>
                      <option value="premium_economy">Premium Economy</option>
                      <option value="business">Business</option>
                      <option value="first">First</option>
                    </select>
                  </Field>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Searching…" : "Search Flights"}
            </button>
          </div>
        </form>
      </SearchCard>
      <ResultsPanel loading={loading} error={error} data={data} />
      <MembershipUpgradeDialog open={gate} onOpenChange={setGate} reason="search" />
    </PageShell>
  );
}
