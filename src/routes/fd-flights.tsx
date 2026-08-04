import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { SearchForm, Field, inputClass } from "@/components/search-form";
import { searchFlights } from "@/lib/wwl.functions";
import { LocationAutocomplete } from "@/components/location-autocomplete";

export const Route = createFileRoute("/fd-flights")({
  head: () => ({
    meta: [
      { title: "FD Flights — Worldway Travels Group" },
      {
        name: "description",
        content: "Fixed-departure (FD) flights — guaranteed group departures on premier routes.",
      },
    ],
  }),
  component: FdFlightsPage,
});

function FdFlightsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="FD Flights"
        title="Fixed departures, guaranteed seats."
        subtitle="Search confirmed group departures across curated international routes — live availability from our partner network."
        image="https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchForm
        title="FD Flight Search"
        fn={searchFlights}
        buildPayload={(f) => ({
          origin: f.get("origin"),
          destination: f.get("destination"),
          depart_date: f.get("depart_date"),
          return_date: f.get("return_date") || undefined,
          passengers: Number(f.get("passengers") || 1),
          cabin: f.get("cabin"),
        })}
      >
        <Field label="From">
          <LocationAutocomplete
            name="origin"
            kind="airports"
            required
            placeholder="JFK, London Heathrow…"
          />
        </Field>
        <Field label="To">
          <LocationAutocomplete
            name="destination"
            kind="airports"
            required
            placeholder="LHR, Paris CDG…"
          />
        </Field>
        <Field label="Departure">
          <input type="date" name="depart_date" required className={inputClass} />
        </Field>
        <Field label="Return">
          <input type="date" name="return_date" className={inputClass} />
        </Field>
        <Field label="Seats">
          <input type="number" min={1} defaultValue={1} name="passengers" className={inputClass} />
        </Field>
        <Field label="Cabin">
          <select name="cabin" className={inputClass} defaultValue="business">
            <option value="economy">Economy</option>
            <option value="premium_economy">Premium Economy</option>
            <option value="business">Business</option>
            <option value="first">First</option>
          </select>
        </Field>
      </SearchForm>
      <p className="mx-auto mt-6 max-w-3xl px-6 text-center text-xs text-muted-foreground">
        Results shown reflect live inventory. Dedicated FD-only schedules will surface here as soon
        as the partner API exposes them.
      </p>
    </PageShell>
  );
}
