import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { agentNav } from "@/lib/portal-nav";

const kits = [
  { title: "Global Brochure 2026", size: "24 MB" },
  { title: "Africa Safari Portfolio", size: "18 MB" },
  { title: "Antarctica Expedition Cruises", size: "12 MB" },
  { title: "Private Aviation Deck", size: "9 MB" },
  { title: "Honeymoon Inspiration Guide", size: "15 MB" },
  { title: "Co-branded Email Templates", size: "3 MB" },
];

export const Route = createFileRoute("/agent/collateral")({
  head: () => ({ meta: [{ title: "Collateral | Agent Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Marketing" title="Collateral library" intro="Brochures, itineraries and co-branded assets ready to share with clients." nav={agentNav}>
      <ul className="divide-y divide-border rounded-sm border border-border bg-card">
        {kits.map((k) => (
          <li key={k.title} className="flex items-center justify-between p-4">
            <div>
              <p className="font-serif text-lg">{k.title}</p>
              <p className="text-xs text-muted-foreground">PDF · {k.size}</p>
            </div>
            <span className="text-xs uppercase tracking-widest text-gold">Download</span>
          </li>
        ))}
      </ul>
    </PortalShell>
  ),
});
