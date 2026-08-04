import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { SearchForm, Field, inputClass } from "@/components/search-form";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { buildTrip } from "@/lib/wwl.functions";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "@/components/membership-upgrade-dialog";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/trip-builder")({
  head: () => ({
    meta: [
      { title: "Trip Builder — Worldway Travels Group" },
      { name: "description", content: "Compose a bespoke multi-city itinerary in minutes." },
    ],
  }),
  component: TripBuilderPage,
});

function TripBuilderPage() {
  // Membership lives in localStorage, which is unreadable during SSR.
  // Check access inside useEffect so the initial (SSR) render never ships
  // the paywall to paying members and cause a hydration flash.
  const [ready, setReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [gate, setGate] = useState(false);
  useEffect(() => {
    const ok = portal.hasAiAccess();
    setHasAccess(ok);
    setGate(!ok);
    setReady(true);
  }, []);

  if (!ready) {
    // Neutral SSR shell — no paywall, no builder — until we know membership.
    return (
      <PageShell>
        <PageHero
          eyebrow="Trip Builder"
          title="Compose a bespoke journey."
          subtitle="Multi-city, multi-modal — orchestrated end to end."
          image="https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=2000&q=80"
        />
      </PageShell>
    );
  }

  if (!hasAccess) {
    return (
      <PageShell>
        <PageHero
          eyebrow="AI Trip Builder"
          title="An Elite privilege."
          subtitle="Multi-city, multi-modal itineraries — reserved for Worldway Elite members."
          image="https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=2000&q=80"
        />
        <MembershipUpgradeDialog open={gate} onOpenChange={setGate} reason="ai" />
      </PageShell>
    );
  }
  return (
    <PageShell>
      <PageHero
        eyebrow="Trip Builder"
        title="Compose a bespoke journey."
        subtitle="Multi-city, multi-modal — orchestrated end to end."
        image="https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=2000&q=80"
      />
      <SearchForm
        title="Design your journey"
        submitLabel="Build Trip"
        fn={buildTrip}
        buildPayload={(f) => {
          const interests = String(f.get("destinations") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const budgetNum = Number(f.get("budget"));
          const style = String(f.get("style") || "");
          const originStr = String(f.get("origin") || "");
          const notesRaw = String(f.get("notes") || "");
          const notes = [
            originStr ? `Origin: ${originStr}` : "",
            style ? `Style: ${style}` : "",
            notesRaw,
          ]
            .filter(Boolean)
            .join(" | ");
          return {
            destination: interests[0] ?? "",
            start_date: f.get("start_date"),
            end_date: f.get("end_date"),
            travelers: Number(f.get("travelers") || 2),
            budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
            interests: interests.length > 1 ? interests.slice(1) : undefined,
            notes: notes || undefined,
          };
        }}
      >
        <Field label="Starting City">
          <LocationAutocomplete
            name="origin"
            kind="locations"
            required
            placeholder="New York, Paris…"
          />
        </Field>
        <Field label="Destinations (comma separated)">
          <input
            name="destinations"
            required
            placeholder="Paris, Amalfi, Marrakech"
            className={inputClass}
          />
        </Field>
        <Field label="Start">
          <input type="date" name="start_date" required className={inputClass} />
        </Field>
        <Field label="End">
          <input type="date" name="end_date" required className={inputClass} />
        </Field>
        <Field label="Travelers">
          <input type="number" min={1} defaultValue={2} name="travelers" className={inputClass} />
        </Field>
        <Field label="Style">
          <select name="style" className={inputClass} defaultValue="luxury">
            <option value="luxury">Luxury</option>
            <option value="ultra_luxury">Ultra Luxury</option>
            <option value="adventure">Adventure</option>
            <option value="wellness">Wellness</option>
          </select>
        </Field>
        <Field label="Budget (USD)">
          <input name="budget" placeholder="50000" className={inputClass} />
        </Field>
        <Field label="Notes">
          <input name="notes" placeholder="Anniversary trip…" className={inputClass} />
        </Field>
      </SearchForm>
    </PageShell>
  );
}
