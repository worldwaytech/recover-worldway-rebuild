import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { SearchForm, Field, inputClass } from "@/components/search-form";
import { quotePrivateJet } from "@/lib/wwl.functions";
import { LocationAutocomplete } from "@/components/location-autocomplete";

export const Route = createFileRoute("/private-jets")({
  head: () => ({
    meta: [
      { title: "Private Jets — Worldway Travels Group" },
      {
        name: "description",
        content: "Instant private aviation quotes across light jets, midsize, and heavy.",
      },
    ],
  }),
  component: JetsPage,
});

function JetsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Private Aviation"
        title="Wheels up, on your schedule."
        subtitle="Instant quotes across the world's finest private aircraft."
        image="https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchForm
        title="Jet Quote"
        submitLabel="Request Quote"
        fn={quotePrivateJet}
        requireSession
        buildPayload={(f) => {
          const dt = String(f.get("departure_at") || "");
          const depart_date = dt.split("T")[0];
          return {
            origin: f.get("origin"),
            destination: f.get("destination"),
            depart_date,
            passengers: Number(f.get("passengers") || 4),
            aircraft: f.get("aircraft"),
          };
        }}
      >
        <Field label="From">
          <LocationAutocomplete name="origin" kind="airports" required placeholder="TEB, LTN…" />
        </Field>
        <Field label="To">
          <LocationAutocomplete
            name="destination"
            kind="airports"
            required
            placeholder="LBG, NCE…"
          />
        </Field>
        <Field label="Departure">
          <input type="datetime-local" name="departure_at" required className={inputClass} />
        </Field>
        <Field label="Passengers">
          <input type="number" min={1} defaultValue={4} name="passengers" className={inputClass} />
        </Field>
        <Field label="Aircraft">
          <select name="aircraft" className={inputClass} defaultValue="midsize">
            <option value="light">Light Jet</option>
            <option value="midsize">Midsize Jet</option>
            <option value="super_midsize">Super Midsize</option>
            <option value="heavy">Heavy Jet</option>
            <option value="ultra_long_range">Ultra Long Range</option>
          </select>
        </Field>
      </SearchForm>
    </PageShell>
  );
}
