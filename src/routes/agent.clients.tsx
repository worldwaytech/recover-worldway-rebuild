import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { agentNav } from "./agent.index";
import { EmptyState } from "@/components/enterprise";

export const Route = createFileRoute("/agent/clients")({
  head: () => ({ meta: [{ title: "Clients | Agent Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="CRM" title="Clients" intro="Traveler profiles, passport data, preferences and full trip history." nav={agentNav}>
      <EmptyState title="No clients yet" text="Add clients to keep passport, dietary and celebration data at your fingertips." />
    </PortalShell>
  ),
});
