import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero, SearchCard, Field } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { Up17CityAutocomplete } from "@/components/up17/city-autocomplete";
import { Up17BusResults } from "@/components/up17/bus-results";
import { up17BusSearch } from "@/lib/up17/up17.functions";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "@/components/membership-upgrade-dialog";

export const Route = createFileRoute("/buses")({
  head: () => ({
    meta: [
      { title: "Coach & Bus — Worldway Travels Group" },
      { name: "description", content: "Executive coaches and private group transportation." },
    ],
  }),
  component: BusesPage,
});

function BusesPage() {
  const runBusSearch = useServerFn(up17BusSearch);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [gate, setGate] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    window.dispatchEvent(new Event("wwtg:search-submit"));
    if (!origin || !destination) {
      setError("Please choose both cities.");
      return;
    }
    if (!portal.canSearch()) {
      setGate(true);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await runBusSearch({ data: { origin, destination, date, passengers } });
      if (!res.ok) setError(res.error ?? "Request failed");
      else {
        portal.recordSearch();
        setData(res);
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
        eyebrow="Coach & Bus"
        title="Move your group in comfort."
        subtitle="Executive coaches, minibuses, and private group fleets."
        image="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchCard title="Bus Search — Worldway Live">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="From">
              <Up17CityAutocomplete
                name="origin_visible"
                required
                kind="bus"
                placeholder="Delhi, Mumbai, Bangalore, Goa…"
                onChange={setOrigin}
                onSelect={(r) => setOrigin(r.city)}
              />
            </Field>
            <Field label="To">
              <Up17CityAutocomplete
                name="destination_visible"
                required
                kind="bus"
                placeholder="Delhi, Mumbai, Bangalore, Goa…"
                onChange={setDestination}
                onSelect={(r) => setDestination(r.city)}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Passengers">
              <input
                type="number"
                min={1}
                max={50}
                value={passengers}
                onChange={(e) => setPassengers(Number(e.target.value) || 1)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Searching…" : "Search Buses"}
            </button>
          </div>
        </form>
      </SearchCard>
      <Up17BusResults loading={loading} error={error} data={data} />
      <MembershipUpgradeDialog open={gate} onOpenChange={setGate} reason="search" />
    </PageShell>
  );
}
