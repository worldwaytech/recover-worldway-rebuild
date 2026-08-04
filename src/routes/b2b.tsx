import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { PortalShell } from "@/components/portal-shell";
import { useVerifiedRole } from "@/hooks/use-verified-role";
import { LayoutDashboard, Users, ScrollText, BarChart3, Wallet } from "lucide-react";

export const Route = createFileRoute("/b2b")({
  head: () => ({
    meta: [
      { title: "Corporate Portal — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Corporate travel management — teams, policies, wallet, reporting, and dedicated account manager.",
      },
    ],
  }),
  component: B2BLayout,
});

const NAV = [
  { to: "/b2b", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/b2b/team", label: "Team", icon: <Users className="h-4 w-4" /> },
  { to: "/b2b/policies", label: "Policies", icon: <ScrollText className="h-4 w-4" /> },
  { to: "/b2b/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
];

function B2BLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalUser | null>(null);
  const verified = useVerifiedRole(["b2b", "admin", "super_admin"]);
  useEffect(() => {
    if (verified === "checking") return;
    if (verified === "denied") {
      nav({ to: "/auth" });
      return;
    }
    const s = portal.session();
    if (!s) {
      nav({ to: "/auth" });
      return;
    }
    if (s.role !== "b2b" && s.role !== "admin" && s.role !== "super_admin") {
      nav({ to: "/b2c" });
      return;
    }
    setMe(s);
  }, [nav, verified]);
  if (verified !== "allowed" || !me) return null;

  return (
    <PortalShell user={me} label="Corporate · B2B" nav={NAV} compact>
      <Outlet />
    </PortalShell>
  );
}
