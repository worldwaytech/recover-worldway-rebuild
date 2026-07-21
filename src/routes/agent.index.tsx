import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { LayoutDashboard, Users, Wallet, FileText, LineChart, Settings, BookOpen, GraduationCap } from "lucide-react";

const agentNav = [
  { label: "Overview", to: "/agent", exact: true },
  { label: "Bookings", to: "/agent/bookings" },
  { label: "Commissions", to: "/agent/commissions" },
  { label: "Clients", to: "/agent/clients" },
  { label: "Collateral", to: "/agent/collateral" },
  { label: "Training", to: "/agent/training" },
];

export const Route = createFileRoute("/agent/")({
  head: () => ({ meta: [{ title: "Agent Portal | Worldway Luxe" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell
      eyebrow="For accredited agents"
      title="Agent Portal"
      intro="Bookings, commissions, marketing collateral, training and preferred-partner benefits."
      nav={agentNav}
      tiles={[
        { icon: LayoutDashboard, title: "Bookings", text: "Active bookings, departures and quote pipeline.", to: "/agent/bookings" },
        { icon: Wallet, title: "Commissions", text: "Real-time commission ledger with monthly payouts.", to: "/agent/commissions" },
        { icon: FileText, title: "Collateral", text: "Brochures and co-branded assets ready to send.", to: "/agent/collateral" },
        { icon: Users, title: "Clients CRM", text: "Passenger profiles, passport data and travel history.", to: "/agent/clients" },
        { icon: LineChart, title: "Performance", text: "Year-over-year sales, mix and pipeline analytics." },
        { icon: GraduationCap, title: "Training", text: "Product accreditation, destination masterclasses.", to: "/agent/training" },
        { icon: BookOpen, title: "Preferred rates", text: "Virtuoso, FSPP, STARS and Impresario benefits." },
        { icon: Settings, title: "Preferences", text: "Notification, calendar and payout preferences." },
      ]}
    />
  ),
});

export { agentNav };
