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
  Network,
  Plane,
  Hotel,
  Ship,
  Compass,
  Car,
  TrainFront,
  Home,
  Sailboat,
  Trees,
  Search,
  BarChart3,
} from "lucide-react";
import type { JSX } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAdminRegistry } from "@/lib/admin/product-ops.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Worldway Travels Group" },
      { name: "description", content: "Admin portal for Worldway Travels Group operations." },
    ],
  }),
  component: AdminLayout,
});

const I = (C: typeof PlugZap) => <C className="h-4 w-4" />;
type Nav = { to: string; label: string; icon: JSX.Element; group: string };
const G = (group: string, items: [string, string, typeof PlugZap][]): Nav[] =>
  items.map(([to, label, C]) => ({ to, label, icon: I(C), group }));

const NAV: Nav[] = [
  ...G("Operations", [
    ["/admin", "Overview", LayoutDashboard],
    ["/admin/crm", "CRM", Contact2],
    ["/admin/bookings", "Bookings", ClipboardList],
    ["/admin/operations", "Booking operations", ClipboardList],
    ["/admin/payments", "Payments", CreditCard],
  ]),
  ...G("API & Registry", [
    ["/admin/api", "API Management", KeyRound],
    ["/admin/integrations", "API & Sync Center", Network],
    ["/admin/partners", "Partner connectors", PlugZap],
  ]),
  ...G("Flights", [["/admin/airiq", "AIR iQ flights", Plane]]),
  ...G("Hotels", [
    ["/admin/hbx", "HBX connector", Hotel],
    ["/admin/ratehawk", "RateHawk", Hotel],
  ]),
  ...G("Cruises", [
    ["/admin/crystal", "Crystal Cruises", Ship],
    ["/admin/ops/cruisea", "Cruisea & General Cruises", Ship],
  ]),
  ...G("Tours & Activities", [
    ["/admin/viator-affiliate", "Viator Affiliate", Compass],
    ["/admin/viator-merchant", "Viator Merchant (Sandbox)", Compass],
    ["/admin/viator-diagnostics", "Viator Diagnostic Export", Compass],
    ["/admin/tours", "Tours connector", Compass],
    ["/admin/ttc", "TTC tours", Compass],
    ["/admin/bokun", "Bókun Marketplace", Compass],
  ]),
  ...G("Transfers & Insurance", [
    ["/admin/ops/trip-services", "TripJack Cabs & TripSafe", Car],
    ["/admin/tripjack", "TripJack certification", Car],
  ]),
  ...G("Luxury Collections", [
    ["/admin/ops/aviation", "Private Aviation & Empty Legs", Plane],
    ["/admin/ops/rail", "Rail", TrainFront],
    ["/admin/ops/villas", "Villas", Home],
    ["/admin/ops/yachts", "Yachts", Sailboat],
    ["/admin/ops/safari", "Safari", Trees],
  ]),
  ...G("Growth", [
    ["/admin/seo", "SEO", Search],
    ["/admin/analytics", "Analytics", BarChart3],
    ["/admin/content", "Content & Flags", FileCog],
  ]),
  ...G("People & Compliance", [
    ["/admin/users", "Users", Users],
    ["/admin/agents", "Agents", Briefcase],
    ["/admin/kyc", "KYC & Compliance", BadgeCheck],
  ]),
  ...G("System", [
    ["/admin/audit", "Audit log", ScrollText],
    ["/admin/settings", "Settings", Settings],
    ["/admin/super", "Super Admin", ShieldAlert],
  ]),
];

// Registry providers that already have a dedicated console. Any provider in
// integration_providers not listed here is auto-listed under
// "Other registered connectors" so new suppliers appear without code changes.
const COVERED = new Set([
  "airiq", "hbx-hotels", "hbx-activities", "hbx-transfers", "hotelbeds", "ratehawk", "crystal-cruises",
  "cruisea", "viator", "viator-merchant", "ttc", "bokun", "g-adventures", "abercrombie-kent",
  "tripjack-cabs", "tripjack-tripsafe", "razorpay", "worldwayluxe",
]);


function AdminLayout() {
  const nav = useNavigate();
  const [user, setUser] = useState<PortalUser | null>(null);
  const verified = useVerifiedRole(["admin", "super_admin"]);
  const fetchRegistry = useServerFn(getAdminRegistry);
  const registry = useQuery({
    queryKey: ["admin-registry-nav"],
    queryFn: async () => {
      try {
        return await fetchRegistry();
      } catch {
        return []; // non-critical: sidebar still renders without discovered connectors
      }
    },
    retry: false,
    enabled: verified === "allowed",
    staleTime: 5 * 60_000,
  });
  const discovered: Nav[] = (registry.data ?? [])
    .filter((p) => !COVERED.has(p.provider_key))
    .map((p) => ({
      to: "/admin/integrations",
      label: `${p.name}${p.enabled === false ? " (off)" : ""}`,
      icon: I(PlugZap),
      group: "Other registered connectors",
    }));

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
    <PortalShell user={user} label="Admin" nav={[...NAV, ...discovered]} compact>
      <Outlet />
    </PortalShell>
  );
}
