import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { EmptyState } from "@/components/enterprise";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/travelers")({
  head: () => ({ meta: [{ title: "Travelers | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Party" title="Saved travelers" intro="Store passport data, dietary needs and loyalty numbers for everyone you travel with." nav={portalNav}>
      <EmptyState
        title="No travelers saved yet"
        text="Save companions once and re-use them on every booking. Data is stored securely with row-level security once Lovable Cloud is enabled."
        action={<Button variant="gold" disabled>Add traveler</Button>}
      />
    </PortalShell>
  ),
});
