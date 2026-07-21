import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { adminNav } from "./admin.index";

const stages = [
  { label: "New leads", count: 0 },
  { label: "Qualifying", count: 0 },
  { label: "Proposal sent", count: 0 },
  { label: "Deposit", count: 0 },
  { label: "Confirmed", count: 0 },
  { label: "Departed", count: 0 },
];

export const Route = createFileRoute("/admin/crm")({
  head: () => ({ meta: [{ title: "CRM | Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell eyebrow="Sales" title="CRM" intro="Customer profiles, sales pipeline, inquiries, tasks and follow-up workflows." nav={adminNav}>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stages.map((s) => (
          <div key={s.label} className="rounded-sm border border-border bg-card p-4">
            <p className="eyebrow">{s.label}</p>
            <p className="mt-2 font-serif text-3xl">{s.count}</p>
            <p className="mt-1 text-xs text-muted-foreground">$0 pipeline value</p>
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-sm border border-border bg-card">
          <div className="border-b border-border p-4"><p className="font-serif text-lg">Today's tasks</p></div>
          <div className="p-4 text-sm text-muted-foreground">No tasks assigned.</div>
        </div>
        <div className="rounded-sm border border-border bg-card">
          <div className="border-b border-border p-4"><p className="font-serif text-lg">Recent inquiries</p></div>
          <div className="p-4 text-sm text-muted-foreground">No inquiries in the last 24 hours.</div>
        </div>
      </div>
    </PortalShell>
  ),
});
