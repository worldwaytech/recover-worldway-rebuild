import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { Button } from "@/components/ui/button";

const groups = [
  { title: "Dietary", options: ["Vegetarian", "Vegan", "Kosher", "Halal", "Gluten free", "Nut allergy"] },
  { title: "Room", options: ["High floor", "Away from lift", "Twin beds", "King bed", "Bathtub", "Non-smoking"] },
  { title: "Cabin & flight", options: ["Aisle seat", "Window seat", "Bulkhead", "Business class", "First class"] },
  { title: "Special occasions", options: ["Honeymoon", "Anniversary", "Birthday", "Proposal", "Family celebration"] },
];

export const Route = createFileRoute("/portal/preferences")({
  head: () => ({ meta: [{ title: "Travel preferences | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Personalisation" title="Travel preferences" intro="Tell us how you love to travel — every proposal, upgrade and touch will reflect it." nav={portalNav}>
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g.title} className="rounded-sm border border-border bg-card p-5">
            <legend className="font-serif text-xl">{g.title}</legend>
            <div className="mt-4 flex flex-wrap gap-2">
              {g.options.map((o) => (
                <label key={o} className="cursor-pointer rounded-sm border border-border bg-background px-3 py-1.5 text-xs uppercase tracking-widest">
                  <input type="checkbox" className="mr-2 align-middle" disabled /> {o}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-6"><Button variant="gold" disabled>Save preferences</Button></div>
    </PortalShell>
  ),
});
