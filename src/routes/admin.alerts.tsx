import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { StatTile } from "@/components/portal-shell";
import { getOpsAlerts, type OpsAlert } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/alerts")({
  head: adminHead("Operations Alerts", "Supplier, booking, payment, price and certification alerts."),
  component: AlertsPage,
});

function AlertsPage() {
  const q = useConsole<OpsAlert[]>("alerts", getOpsAlerts);
  const [kind, setKind] = useState("all");
  const all = q.data ?? [];
  const kinds = Array.from(new Set(all.map((a) => a.kind)));
  const rows = kind === "all" ? all : all.filter((a) => a.kind === kind);
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Operations" title="Operations Alerts" intro="Built from live supplier health, API logs, syncs, bookings, payments, journey price changes and certification cases." />
      <QueryState q={q}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Critical" value={String(all.filter((a) => a.severity === "critical").length)} />
          <StatTile label="Warnings" value={String(all.filter((a) => a.severity === "warning").length)} />
          <StatTile label="Categories" value={String(kinds.length)} />
        </div>
        <Panel title="Alerts" right={
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
            <option value="all">All</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>}>
          <ul className="divide-y divide-border/40 text-sm">
            {rows.map((a, i) => (
              <li key={i} className="flex gap-3 py-3">
                <span className={`mt-0.5 h-fit rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-widest ${a.severity === "critical" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>{a.severity}</span>
                <div className="min-w-0">
                  <div>{a.kind} · {a.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.detail}</div>
                </div>
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{when(a.at)}</span>
              </li>
            ))}
          </ul>
          {!rows.length && <Empty>No active alerts.</Empty>}
        </Panel>
      </QueryState>
    </div>
  );
}
