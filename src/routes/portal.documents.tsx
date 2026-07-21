import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/portal/documents")({
  head: () => ({ meta: [{ title: "Documents | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Travel wallet" title="Documents" intro="Vouchers, tickets, visas, travel insurance and passports." nav={portalNav}>
      <EmptyState title="No documents yet" text="Booking documents and travel insurance policies will appear here once your first booking is confirmed." />
    </PortalShell>
  ),
});
