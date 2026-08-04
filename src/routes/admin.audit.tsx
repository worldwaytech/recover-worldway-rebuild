import { createFileRoute } from "@tanstack/react-router";
import { admin } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log — Worldway Travels Group" }] }),
  component: AuditPage,
});

function AuditPage() {
  const rows = admin.audit();
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Security</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Audit log · {rows.length}</h1>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <ul className="divide-y divide-border/40 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4">
              <span
                className={`inline-block w-16 rounded-full px-2 py-0.5 text-center text-[0.6rem] uppercase tracking-[0.25em] ${r.severity === "critical" ? "bg-destructive/15 text-destructive" : r.severity === "warn" ? "bg-amber-500/15 text-amber-500" : "bg-primary/10 text-primary"}`}
              >
                {r.severity}
              </span>
              <div>
                <div className="text-foreground">
                  {r.action} <span className="text-muted-foreground">— {r.target}</span>
                </div>
                <div className="text-xs text-muted-foreground">{r.actor}</div>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(r.at).toLocaleString()}
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-6 text-sm text-muted-foreground">No events recorded.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
