import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero, SearchCard, Field } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { Up17CityAutocomplete } from "@/components/up17/city-autocomplete";
import { Up17HotelResults } from "@/components/up17/hotel-results";
import { up17HotelSearch } from "@/lib/up17/up17.functions";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "@/components/membership-upgrade-dialog";

export const Route = createFileRoute("/hotels/")({
  head: () => ({
    meta: [
      { title: "Luxury Hotels & Villas — Worldway Travels Group" },
      {
        name: "description",
        content: "Search five-star hotels, private villas and heritage estates worldwide with live rates and availability, arranged by the Worldway Travels Group team.",
      },
      { property: "og:title", content: "Luxury Hotels & Villas — Worldway Travels Group" },
      { property: "og:description", content: "Search five-star hotels, private villas and heritage estates worldwide with live rates and availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HotelsPage,
});

function HotelsPage() {
  const runHotelSearch = useServerFn(up17HotelSearch);
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [gate, setGate] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    window.dispatchEvent(new Event("wwtg:search-submit"));
    if (!destination) {
      setError("Please choose a destination.");
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
      const res = await runHotelSearch({
        data: { destination, check_in: checkIn, check_out: checkOut, guests, rooms },
      });
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
        eyebrow="Hotels & Residences"
        title="Sleep somewhere unforgettable."
        subtitle="Curated palaces, villas, and design hotels around the world."
        image="https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchCard title="Hotel Search — Live">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Field label="Destination">
              <Up17CityAutocomplete
                name="destination_visible"
                required
                kind="hotel"
                placeholder="Dubai, London, New Delhi, Singapore…"
                onChange={setDestination}
                onSelect={(r) => setDestination(`${r.city}, ${r.country}`)}
              />
            </Field>
            <Field label="Check In">
              <input
                type="date"
                required
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Check Out">
              <input
                type="date"
                required
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Guests">
              <input
                type="number"
                min={1}
                max={20}
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value) || 1)}
                className={inputClass}
              />
            </Field>
            <Field label="Rooms">
              <input
                type="number"
                min={1}
                max={10}
                value={rooms}
                onChange={(e) => setRooms(Number(e.target.value) || 1)}
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
              {loading ? "Searching…" : "Search Hotels"}
            </button>
          </div>
        </form>
      </SearchCard>
      <Up17HotelResults loading={loading} error={error} data={data} />
      <MembershipUpgradeDialog open={gate} onOpenChange={setGate} reason="search" />
    </PageShell>
  );
}
