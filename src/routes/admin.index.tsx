import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { admin } from "@/lib/admin-store";
import { StatTile } from "@/components/portal-shell";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Console — Worldway" },
      { name: "description", content: "Operations overview for the Worldway platform." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin Console — Worldway" },
      { property: "og:description", content: "Operations overview for the Worldway platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  useEffect(() => {
    setUsers(portal.users());
  }, []);
  const bookings = admin.bookings();
  const payments = admin.payments();
  const leads = admin.leads();
  const keys = admin.apiKeys();
  const revenue = payments.filter((p) => p.status === "captured").reduce((s, p) => s + p.amount, 0);
  const stats = [
    { label: "Users", value: String(users.length) },
    { label: "Bookings", value: String(bookings.length) },
    { label: "Revenue", value: `$${(revenue / 1000).toFixed(0)}K` },
    {
      label: "Open leads",
      value: String(leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length),
    },
    { label: "Active API keys", value: String(keys.filter((k) => k.status === "active").length) },
    { label: "Agents", value: String(users.filter((u) => u.role === "agent").length) },
  ];
  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Command centre</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Operational overview</h1>
        <p className="text-sm text-muted-foreground">A live snapshot of Worldway Travels Group.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
      <div
        className="rounded-2xl border border-border/60 bg-card/60 p-6"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-primary">Recent signups</h2>
          <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
            Last 8
          </span>
        </div>
        <ul className="divide-y divide-border/40 text-sm">
          {users
            .slice(-8)
            .reverse()
            .map((u) => (
              <li key={u.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs uppercase text-primary">
                    {u.name.charAt(0)}
                  </span>
                  <div>
                    <div>{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                </div>
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-primary">
                  {u.role}
                </span>
              </li>
            ))}
          {users.length === 0 && (
            <li className="py-4 text-sm text-muted-foreground">No signups yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
