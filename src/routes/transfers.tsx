import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { SearchForm, Field, inputClass } from "@/components/search-form";
import { searchTransfers } from "@/lib/wwl.functions";
import { LocationAutocomplete } from "@/components/location-autocomplete";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "Transfers — Worldway Travels Group" },
      {
        name: "description",
        content: "Chauffeured black-car and armored transfers, city to tarmac.",
      },
    ],
  }),
  component: TransfersPage,
});

function TransfersPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Transfers"
        title="Kerb to cabin, seamlessly."
        subtitle="Chauffeured saloons, SUVs, and armored fleets on request."
        image="https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchForm
        title="Transfer Search"
        fn={searchTransfers}
        buildPayload={(f) => {
          const dt = String(f.get("pickup_at") || "");
          const [date, timeRaw] = dt.split("T");
          const time = (timeRaw || "").slice(0, 5);
          return {
            pickup: f.get("pickup"),
            dropoff: f.get("dropoff"),
            date,
            time: time || undefined,
            passengers: Number(f.get("passengers") || 2),
            vehicle: f.get("vehicle"),
          };
        }}
      >
        <Field label="Pickup">
          <LocationAutocomplete
            name="pickup"
            kind="locations"
            required
            placeholder="LHR, Mayfair…"
          />
        </Field>
        <Field label="Dropoff">
          <LocationAutocomplete
            name="dropoff"
            kind="locations"
            required
            placeholder="Claridge's, JFK…"
          />
        </Field>
        <Field label="Pickup Time">
          <input type="datetime-local" name="pickup_at" required className={inputClass} />
        </Field>
        <Field label="Passengers">
          <input type="number" min={1} defaultValue={2} name="passengers" className={inputClass} />
        </Field>
        <Field label="Vehicle Class">
          <select name="vehicle" className={inputClass} defaultValue="luxury">
            <option value="business">Business Saloon</option>
            <option value="luxury">Luxury Saloon</option>
            <option value="suv">Luxury SUV</option>
            <option value="van">Executive Van</option>
          </select>
        </Field>
      </SearchForm>
    </PageShell>
  );
}
