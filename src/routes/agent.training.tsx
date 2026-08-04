import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { agentNav } from "@/lib/portal-nav";

const modules = [
  { title: "Worldway Foundations", lessons: 6 },
  { title: "Selling Safaris", lessons: 8 },
  { title: "Polar Expeditions Deep-Dive", lessons: 5 },
  { title: "Ultra-Luxury Rail Journeys", lessons: 4 },
  { title: "Private Aviation Fundamentals", lessons: 7 },
];

export const Route = createFileRoute("/agent/training")({
  head: () => ({ meta: [{ title: "Training | Agent Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Accreditation" title="Training academy" intro="Product accreditation, destination masterclasses and preferred-partner certifications." nav={agentNav}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <div key={m.title} className="rounded-sm border border-border bg-card p-6">
            <p className="eyebrow">{m.lessons} lessons</p>
            <h3 className="mt-2 font-serif text-xl">{m.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">Self-paced accreditation with a certificate on completion.</p>
          </div>
        ))}
      </div>
    </PortalShell>
  ),
});
