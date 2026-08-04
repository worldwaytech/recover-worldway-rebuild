import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/portal/reviews")({
  head: () => ({ meta: [{ title: "Reviews | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Feedback" title="Reviews" intro="Rate your recent journeys and share private feedback with the operations team." nav={portalNav}>
      <EmptyState title="Nothing to review yet" text="After each journey we invite you to share highlights and areas we can improve — your feedback shapes future itineraries." />
    </PortalShell>
  ),
});
