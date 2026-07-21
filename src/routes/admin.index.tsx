import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { Shield, Users, Database, LineChart, Settings, FileText, MessageSquare, Search } from "lucide-react";

const adminNav = [
  { label: "Overview", to: "/admin", exact: true },
  { label: "Bookings", to: "/admin/bookings" },
  { label: "CRM", to: "/admin/crm" },
  { label: "Analytics", to: "/admin/analytics" },
  { label: "SEO Suite", to: "/admin/seo" },
  { label: "Users", to: "/admin/users" },
  { label: "Content", to: "/admin/content" },
];

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin | Worldway Luxe" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell
      eyebrow="Internal"
      title="Admin Console"
      intro="Operational control for the Worldway Luxe platform — users, roles, content, bookings, payments and observability."
      nav={adminNav}
      tiles={[
        { icon: LineChart, title: "Analytics", text: "Revenue, bookings, conversion and cohort analytics.", to: "/admin/analytics" },
        { icon: MessageSquare, title: "CRM", text: "Leads, sales pipeline, tasks and follow-ups.", to: "/admin/crm" },
        { icon: FileText, title: "Bookings", text: "Every booking, milestone payment and refund.", to: "/admin/bookings" },
        { icon: Users, title: "Users & agents", text: "Accredit, suspend and audit accounts.", to: "/admin/users" },
        { icon: Database, title: "Content CMS", text: "Destinations, journeys, collections and pricing.", to: "/admin/content" },
        { icon: Search, title: "SEO Suite", text: "Metadata, sitemap, structured data, audits.", to: "/admin/seo" },
        { icon: Shield, title: "Roles & permissions", text: "app_role management via user_roles + has_role." },
        { icon: Settings, title: "Platform settings", text: "Feature flags, gateways, keys, email templates." },
      ]}
    />
  ),
});

export { adminNav };
