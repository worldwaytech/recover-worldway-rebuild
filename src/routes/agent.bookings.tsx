import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { agentNav } from "@/lib/portal-nav";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/agent/bookings")({
  head: () => ({ meta: [{ title: "Bookings | Agent Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Sales" title="Bookings" intro="Every booking your agency has placed with Worldway Luxe." nav={agentNav}>
      <EmptyState title="No bookings yet" text="Once your agency's first booking is confirmed, it will appear here with milestone dates and payment status." />
    </PortalShell>
  ),
});
