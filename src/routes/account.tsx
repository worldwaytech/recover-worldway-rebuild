import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { PortalShell } from "@/components/portal-shell";
import {
  LayoutDashboard,
  MapPin,
  ClipboardList,
  Heart,
  Users,
  FileText,
  Bell,
  Wallet,
  Compass,
  Ticket,
} from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Account — Worldway Travels Group" },
      {
        name: "description",
        content: "Manage your trips, bookings, travellers, documents and preferences.",
      },
      { property: "og:title", content: "My Account — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Manage your trips, bookings, travellers, documents and preferences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountLayout,
});

const NAV = [
  { to: "/account", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/account/trips", label: "My trips", icon: <MapPin className="h-4 w-4" /> },
  { to: "/account/trip-planner", label: "Trip planner", icon: <Compass className="h-4 w-4" /> },
  { to: "/account/bookings", label: "Bookings", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/account/tours", label: "Tours", icon: <MapPin className="h-4 w-4" /> },
  { to: "/account/travel", label: "Flights, hotels & buses", icon: <Ticket className="h-4 w-4" /> },
  { to: "/account/saved", label: "Saved", icon: <Heart className="h-4 w-4" /> },
  { to: "/account/travellers", label: "Travellers", icon: <Users className="h-4 w-4" /> },
  { to: "/account/documents", label: "Documents", icon: <FileText className="h-4 w-4" /> },
  { to: "/account/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { to: "/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
];

function AccountLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalUser | null>(null);

  useEffect(() => {
    const sync = () => {
      const s = portal.session();
      if (s) setMe(s);
    };
    sync();
    const stop = portal.subscribe(sync);
    const t = setTimeout(() => {
      if (!portal.session()) nav({ to: "/auth" });
    }, 1500);
    return () => {
      stop();
      clearTimeout(t);
    };
  }, [nav]);

  if (!me) return null;

  return (
    <PortalShell user={me} label={me.role.toUpperCase()} nav={NAV} compact>
      <Outlet />
    </PortalShell>
  );
}
