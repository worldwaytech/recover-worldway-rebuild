import type { PortalNavItem } from "@/components/PortalShell";

/**
 * Navigation for the reconstructed admin/agent portal surfaces.
 * Kept separate from route modules so pages stay side-effect free.
 */
export const adminNav: PortalNavItem[] = [
  { label: "Overview", to: "/admin", exact: true },
  { label: "Analytics", to: "/admin/analytics" },
  { label: "CRM", to: "/admin/crm" },
  { label: "Bookings", to: "/admin/bookings" },
  { label: "Payments", to: "/admin/payments" },
  { label: "Users", to: "/admin/users" },
  { label: "Content", to: "/admin/content" },
  { label: "SEO Suite", to: "/admin/seo" },
  { label: "Audit", to: "/admin/audit" },
  { label: "Settings", to: "/admin/settings" },
];

export const agentNav: PortalNavItem[] = [
  { label: "Overview", to: "/agent", exact: true },
  { label: "Bookings", to: "/agent/bookings" },
  { label: "Commissions", to: "/agent/commissions" },
  { label: "Clients", to: "/agent/clients" },
  { label: "Collateral", to: "/agent/collateral" },
  { label: "Training", to: "/agent/training" },
];
