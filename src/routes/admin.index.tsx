import { createFileRoute, Link } from "@tanstack/react-router";
import { StatTile } from "@/components/portal-shell";
import { getAdminOverview } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, money, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/")({
  head: adminHead("Admin Console", "Operations overview for the Worldway platform."),
  component: AdminOverview,
});

type O = Awaited<ReturnType<typeof getAdminOverview>>;

function AdminOverview() {
  const q = useConsole<O>("overview", getAdminOverview);
  const d = q.data;
  const n = (v: number | null | undefined) => (v == null ? "—" : String(v));
  return (
    <div className="space-y-8">
      <PageHead eyebrow="Command centre" title="Operational overview" intro="Live figures from the Worldway database." />
      <QueryState q={q}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Users" value={n(d?.users)} />
          <StatTile label="Agents" value={n(d?.agents)} />
          <StatTile label="Staff" value={n(d?.admins)} />
          <StatTile label="Bookings" value={n(d?.bookings)} />
          <StatTile label="Open enquiries" value={n(d?.openEnquiries)} />
          <StatTile label="Active suppliers" value={n(d?.providersOn)} />
        </div>
        <Panel title="Payments received">
          <div className="font-serif text-2xl text-primary">{money(d?.revenue)}</div>
          <p className="mt-1 text-xs text-muted-foreground">Confirmed gateway payments, by currency. <Link to="/admin/analytics" className="text-primary underline">Analytics</Link> · <Link to="/admin/alerts" className="text-primary underline">Alerts</Link></p>
        </Panel>
        <Panel title="Recent signups" right={<span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">Last 8</span>}>
          <ul className="divide-y divide-border/40 text-sm">
            {(d?.recent ?? []).map((u: any) => (
              <li key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <div>{u.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-primary">{u.role}</span>
              </li>
            ))}
          </ul>
          {!d?.recent?.length && <Empty>No signups yet.</Empty>}
        </Panel>
      </QueryState>
    </div>
  );
}
