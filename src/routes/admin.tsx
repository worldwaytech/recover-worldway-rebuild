import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { PortalShell } from "@/components/portal-shell";
import { useVerifiedRole } from "@/hooks/use-verified-role";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  ClipboardList,
  ShieldAlert,
  Contact2,
  KeyRound,
  CreditCard,
  FileCog,
  ScrollText,
  Settings,
  BadgeCheck,
  PlugZap,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Worldway Travels Group" },
      { name: "description", content: "Admin portal for Worldway Travels Group operations." },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/admin/crm", label: "CRM", icon: <Contact2 className="h-4 w-4" /> },
  { to: "/admin/bookings", label: "Bookings", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/admin/operations", label: "Booking operations", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/admin/payments", label: "Payments", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/admin/api", label: "API Management", icon: <KeyRound className="h-4 w-4" /> },
  { to: "/admin/partners", label: "Partner connectors", icon: <PlugZap className="h-4 w-4" /> },
  { to: "/admin/crystal", label: "Crystal Cruises", icon: <PlugZap className="h-4 w-4" /> },
  { to: "/admin/tours", label: "Tours connector", icon: <PlugZap className="h-4 w-4" /> },
  { to: "/admin/hbx", label: "HBX connector", icon: <PlugZap className="h-4 w-4" /> },
  { to: "/admin/tripjack", label: "TripJack certification", icon: <PlugZap className="h-4 w-4" /> },
  { to: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { to: "/admin/agents", label: "Agents", icon: <Briefcase className="h-4 w-4" /> },
  { to: "/admin/kyc", label: "KYC & Compliance", icon: <BadgeCheck className="h-4 w-4" /> },
  { to: "/admin/content", label: "Content & Flags", icon: <FileCog className="h-4 w-4" /> },
  { to: "/admin/audit", label: "Audit log", icon: <ScrollText className="h-4 w-4" /> },
  { to: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  { to: "/admin/super", label: "Super Admin", icon: <ShieldAlert className="h-4 w-4" /> },
];

function AdminLayout() {
  const nav = useNavigate();
  const [user, setUser] = useState<PortalUser | null>(null);
  const verified = useVerifiedRole(["admin", "super_admin"]);

  useEffect(() => {
    if (verified === "checking") return;
    if (verified === "denied") {
      nav({ to: "/auth" });
      return;
    }
    const s = portal.session();
    if (!s || (s.role !== "admin" && s.role !== "super_admin")) {
      nav({ to: "/auth" });
      return;
    }
    setUser(s);
  }, [nav, verified]);

  if (verified !== "allowed" || !user) return null;

  return (
    <PortalShell user={user} label="Admin" nav={NAV} compact>
      <Outlet />
    </PortalShell>
  );
}
