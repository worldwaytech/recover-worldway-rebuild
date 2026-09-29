import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { listJourneys, getJourneyDetail } from "@/lib/admin/console.functions";
import { PageHead, Panel, QueryState, Empty, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/journeys")({
  head: adminHead("Journey Console", "Read-only journeys, versions, simulations, approvals and history."),
  component: JourneysPage,
});

type L = Awaited<ReturnType<typeof listJourneys>>;

function Json({ v }: { v: unknown }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  return <pre className="max-h-64 overflow-auto rounded bg-background/60 p-2 text-[0.7rem]">{JSON.stringify(v, null, 2)}</pre>;
}

function Detail({ id }: { id: string }) {
  const q = useConsole<any>("journey", getJourneyDetail, { id });
  const d = q.data;
  return (
    <QueryState q={q}>
      {d && (
        <div className="space-y-4">
          <Panel title={`Journey ${id.slice(0, 8)} · ${d.journey.state} · v${d.journey.current_version}`}>
            <div className="text-xs text-muted-foreground">Currency {d.journey.currency} · created {when(d.journey.created_at)} · updated {when(d.journey.updated_at)}</div>
            <div className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">Requirements</div>
            <Json v={d.journey.requirements} />
          </Panel>
          <Panel title={`Versions (${d.versions.length})`}>
            {d.versions.map((v: any) => (
              <details key={v.version} className="border-t border-border/40 py-2 text-sm">
                <summary className="cursor-pointer">v{v.version}{v.parent_version ? ` ← v${v.parent_version}` : ""} · {v.bookable ? "bookable" : "not bookable"} · {v.reason ?? ""} · {when(v.created_at)}</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div><div className="text-xs text-muted-foreground">Pricing</div><Json v={v.pricing} /></div>
                  <div><div className="text-xs text-muted-foreground">Readiness / issues</div><Json v={{ readiness: v.readiness, issues: v.issues, on_request: v.on_request }} /></div>
                  <div><div className="text-xs text-muted-foreground">Trip graph</div><Json v={v.graph} /></div>
                  <div><div className="text-xs text-muted-foreground">Dependencies / sources</div><Json v={{ dependencies: v.dependencies, sources: v.sources }} /></div>
                </div>
                {v.explanation && <p className="mt-2 text-xs text-muted-foreground">Explanation: {typeof v.explanation === "string" ? v.explanation : JSON.stringify(v.explanation)}</p>}
              </details>
            ))}
            {!d.versions.length && <Empty>No versions.</Empty>}
          </Panel>
          <Panel title={`Simulations (${d.simulations.length})`}>
            {d.simulations.map((s: any) => (
              <details key={s.id} className="border-t border-border/40 py-2 text-sm">
                <summary className="cursor-pointer">From v{s.base_version} · {s.status} · price change {s.price_delta ?? 0} · {s.requires_approval ? "needs approval" : "no approval"} · {when(s.created_at)}</summary>
                <Json v={{ change: s.change, impacted: s.impacted, material: s.material, new_issues: s.new_issues }} />
              </details>
            ))}
            {!d.simulations.length && <Empty>No simulations.</Empty>}
          </Panel>
          <Panel title="Approvals and events">
            <ul className="space-y-1 text-sm">
              {d.approvals.map((a: any, i: number) => <li key={`a${i}`}>{when(a.created_at)} · <b>{a.decision}</b> simulation {String(a.simulation_id).slice(0, 8)}{a.note ? ` — ${a.note}` : ""}</li>)}
              {d.events.map((e: any, i: number) => <li key={`e${i}`} className="text-muted-foreground">{when(e.created_at)} · {e.event_type}{e.from_state ? ` ${e.from_state} → ${e.to_state}` : ""}{e.version ? ` (v${e.version})` : ""}</li>)}
            </ul>
            {!d.approvals.length && !d.events.length && <Empty>No history.</Empty>}
          </Panel>
        </div>
      )}
    </QueryState>
  );
}

function JourneysPage() {
  const q = useConsole<L>("journeys", listJourneys);
  const [sel, setSel] = useState<string | null>(null);
  const rows = (q.data ?? []) as any[];
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Packages" title="Journey Console" intro="Read-only. Changes are made only through the approval-gated journey flow." />
      <QueryState q={q}>
        <Panel title={`Journeys (${rows.length})`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th>Journey</th><th>State</th><th>Version</th><th>Currency</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} onClick={() => setSel(j.id)} className={`cursor-pointer border-t border-border/40 hover:bg-primary/5 ${sel === j.id ? "bg-primary/10" : ""}`}>
                  <td className="py-2">{j.id.slice(0, 8)}</td><td>{j.state}</td><td>v{j.current_version}</td><td>{j.currency}</td><td>{when(j.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>No journeys have been saved yet.</Empty>}
        </Panel>
      </QueryState>
      {sel && <Detail id={sel} />}
    </div>
  );
}
