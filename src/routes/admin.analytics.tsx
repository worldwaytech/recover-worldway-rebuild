import { createFileRoute } from "@tanstack/react-router";
import { StatTile } from "@/components/portal-shell";
import { getAdminAnalytics } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, money, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/analytics")({
  head: adminHead("Analytics", "Bookings, payments and supplier performance from live data."),
  component: AnalyticsPage,
});

type A = Awaited<ReturnType<typeof getAdminAnalytics>>;

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <Empty>No data yet.</Empty>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map(([k, v]) => (
        <li key={k}>
          <div className="flex justify-between"><span>{k}</span><span className="text-muted-foreground">{v}</span></div>
          <div className="mt-1 h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(v / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function AnalyticsPage() {
  const q = useConsole<A>("analytics", getAdminAnalytics);
  const d = q.data;
  return (
    <div className="space-y-8">
      <PageHead eyebrow="Executive" title="Analytics" intro="Every figure is calculated from real bookings, payments and supplier records." />
      <QueryState q={q}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label="Bookings (all time)" value={String(d?.bookingsTotal ?? 0)} />
          <StatTile label="Bookings this month" value={String(d?.bookingsMtd ?? 0)} />
          <StatTile label="Cancellation rate" value={d?.cancellationRate == null ? "—" : `${Math.round(d.cancellationRate * 100)}%`} />
          <StatTile label="Booked value" value={money(d?.bookedValue)} />
          <StatTile label="Gateway revenue (all time)" value={money(d?.gatewayRevenue)} hint={`This month: ${money(d?.gatewayRevenueMtd)}`} />
          <StatTile label="Staff-recorded payments" value={money(d?.recordedPayments)} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Bookings by product"><Bars rows={d?.byProduct ?? []} /></Panel>
          <Panel title="Bookings by status"><Bars rows={d?.byStatus ?? []} /></Panel>
          <Panel title="Paid by purpose"><Bars rows={d?.byPurpose ?? []} /></Panel>
        </div>
        <Panel title="Supplier performance">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th>Supplier</th><th>Status</th><th>Calls</th><th>Failures</th><th>Median ms</th><th>Bookable</th></tr></thead>
            <tbody>
              {(d?.suppliers ?? []).map((s: any) => (
                <tr key={s.key} className="border-t border-border/40"><td className="py-2">{s.key}</td><td>{s.status}</td><td>{s.calls ?? "—"}</td><td>{s.failures ?? "—"}</td><td>{s.p50 ?? "—"}</td><td>{s.bookable ? "Yes" : "No"}</td></tr>
              ))}
            </tbody>
          </table>
          {!d?.suppliers?.length && <Empty>No supplier health records yet.</Empty>}
        </Panel>
        <Panel title="Catalogue syncs (30 days)">
          <Bars rows={(d?.sync ?? []).map((s) => [`${s.key} (${s.failed} failed)`, s.ok + s.failed] as [string, number])} />
        </Panel>
      </QueryState>
    </div>
  );
}
