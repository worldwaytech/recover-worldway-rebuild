import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { adminNav } from "./admin.index";

const kpis = [
  { label: "Revenue MTD", value: "$0", trend: "—" },
  { label: "Bookings MTD", value: "0", trend: "—" },
  { label: "Avg. basket", value: "$0", trend: "—" },
  { label: "Refund rate", value: "0%", trend: "—" },
  { label: "Lead → book", value: "0%", trend: "—" },
  { label: "NPS", value: "—", trend: "—" },
];

const reports = [
  "Revenue by product line",
  "Bookings by region",
  "Top-selling journeys",
  "Agent-driven revenue",
  "Concierge-attributed revenue",
  "Refund and cancellation reasons",
];

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics | Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Executive" title="Analytics" intro="Revenue, bookings, customer and destination performance in a single executive view." nav={adminNav}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-sm border border-border bg-card p-6">
            <p className="eyebrow">{k.label}</p>
            <p className="mt-2 font-serif text-3xl">{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.trend} vs prior period</p>
          </div>
        ))}
      </div>
      <div className="mt-10 rounded-sm border border-border bg-card">
        <div className="border-b border-border p-5">
          <p className="font-serif text-xl">Executive reports</p>
          <p className="text-sm text-muted-foreground">Export-ready scorecards for the leadership team.</p>
        </div>
        <ul className="divide-y divide-border">
          {reports.map((r) => (
            <li key={r} className="flex items-center justify-between p-4">
              <span>{r}</span>
              <span className="text-xs uppercase tracking-widest text-gold">Export CSV · PDF</span>
            </li>
          ))}
        </ul>
      </div>
    </PortalShell>
  ),
});
