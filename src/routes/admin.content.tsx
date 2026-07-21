import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { adminNav } from "./admin.index";

const sections = [
  "Destinations",
  "Journeys",
  "Collections",
  "Blog & guides",
  "Homepage modules",
  "Legal pages",
];

export const Route = createFileRoute("/admin/content")({
  head: () => ({ meta: [{ title: "Content CMS | Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="CMS" title="Content" intro="Manage destinations, journeys, collections, editorial content and legal pages." nav={adminNav}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <div key={s} className="rounded-sm border border-border bg-card p-5">
            <p className="font-serif text-xl">{s}</p>
            <p className="mt-1 text-sm text-muted-foreground">Draft, publish and schedule content revisions.</p>
          </div>
        ))}
      </div>
    </PortalShell>
  ),
});
