import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { adminNav } from "./admin.index";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/admin/bookings")({
  head: () => ({ meta: [{ title: "Bookings | Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Operations" title="Bookings" intro="Every booking across the platform with milestone payments, documents and refund status." nav={adminNav}>
      <EmptyState title="No bookings to show" text="Bookings will appear once the first paid deposit is captured." />
    </PortalShell>
  ),
});
