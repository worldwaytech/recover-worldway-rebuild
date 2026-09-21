import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listAuditTrail, type AuditTrailRow } from "@/lib/admin/oversight.functions";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log — Worldway Travels Group" }] }),
  component: AuditPage,
});

function AuditPage() {
  const load = useServerFn(listAuditTrail);
  const [rows, setRows] = useState<AuditTrailRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");

  useEffect(() => {
    void (async () => {
      try {
        const out = await load({ data: {} });
        setRows(out.rows);
        setState("ready");
      } catch {
        setState("denied");
      }
    })();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Security</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">
          Audit log{state === "ready" ? ` · ${rows.length}` : ""}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Durable record of administrator actions and supplier integration changes. Entries are
          write-once and cannot be edited or removed from this screen.
        </p>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <ul className="divide-y divide-border/40 text-sm">
          {state === "loading" && (
            <li className="p-6 text-sm text-muted-foreground">Loading the audit trail…</li>
          )}
          {state === "denied" && (
            <li className="p-6 text-sm text-muted-foreground">
              You do not have permission to view the audit trail.
            </li>
          )}
          {rows.map((r) => (
            <li key={`${r.source}-${r.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4">
              <span className="inline-block w-24 rounded-full bg-primary/10 px-2 py-0.5 text-center text-[0.6rem] uppercase tracking-[0.2em] text-primary">
                {r.source}
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
          {state === "ready" && rows.length === 0 && (
            <li className="p-6 text-sm text-muted-foreground">No events recorded yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
