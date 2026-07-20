import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "./agent";
import { Shield, Users, Database, LineChart, Settings, FileText } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin | Worldway Luxe" },
      { name: "description", content: "Administrator console for Worldway Luxe operations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PortalShell
      eyebrow="Internal"
      title="Admin Console"
      intro="Operational control for the Worldway Luxe platform — users, roles, content, bookings, payments and observability."
      tiles={[
        { icon: Shield, title: "Roles & permissions", text: "app_role management via user_roles table with has_role RLS." },
        { icon: Users, title: "Users & agents", text: "Accredit, suspend and audit customer, agent and admin accounts." },
        { icon: Database, title: "Catalogue CMS", text: "Manage destinations, journeys, collections and pricing tiers." },
        { icon: LineChart, title: "Operational metrics", text: "Bookings, revenue, refund rate and support SLA at a glance." },
        { icon: FileText, title: "Audit log", text: "Immutable audit trail of every mutation across the platform." },
        { icon: Settings, title: "Platform settings", text: "Feature flags, gateways, keys, email templates and webhooks." },
      ]}
    />
  ),
});
