import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { PortalShell } from "@/components/portal-shell";
import { useVerifiedRole } from "@/hooks/use-verified-role";

export const Route = createFileRoute("/agent")({
  head: () => ({ meta: [{ title: "Agent Portal — Worldway Travels Group" }] }),
  component: AgentLayout,
});

function AgentLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalUser | null>(null);
  const verified = useVerifiedRole(["agent", "admin", "super_admin"]);
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
    if (s.role !== "agent" && s.role !== "admin" && s.role !== "super_admin") {
      nav({ to: "/account" });
      return;
    }
    setMe(s);
  }, [nav, verified]);
  if (verified !== "allowed" || !me) return null;
  return (
    <PortalShell user={me} label="Agent" compact>
      <Outlet />
    </PortalShell>
  );
}
