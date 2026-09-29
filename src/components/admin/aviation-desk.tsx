import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminAviationHealth,
  adminListAviationRequests,
  adminRefreshAviationStatus,
} from "@/lib/aviation/private-aviation.functions";
import { Button } from "@/components/ui/button";

export function AviationDesk() {
  const healthFn = useServerFn(adminAviationHealth);
  const listFn = useServerFn(adminListAviationRequests);
  const refreshFn = useServerFn(adminRefreshAviationStatus);
  const qc = useQueryClient();
  const [health, setHealth] = useState<Awaited<ReturnType<typeof adminAviationHealth>> | null>(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin-aviation-requests"], queryFn: () => listFn(), retry: false });

  async function check() {
    setChecking(true);
    try {
      setHealth(await healthFn());
    } catch {
      setMsg("Health check failed to run.");
    } finally {
      setChecking(false);
    }
  }

  async function refresh(id: string) {
    const r = await refreshFn({ data: { id } });
    setMsg(r.ok ? `Status: ${r.status}${r.stage ? ` (${r.stage})` : ""}` : r.error);
    qc.invalidateQueries({ queryKey: ["admin-aviation-requests"] });
  }

  return (
    <section className="mt-10 space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl">Villiers connector (admin only)</h2>
            <p className="text-xs text-muted-foreground">MCP charter pricing + personalised empty-leg RSS feed. Credentials are server-side secrets.</p>
          </div>
          <Button size="sm" onClick={check} disabled={checking}>{checking ? "Checking…" : "Run health check"}</Button>
        </div>
        {health && (
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>Secrets: URL {health.configured.mcpUrl ? "✓" : "✗"} · token {health.configured.mcpToken ? "✓" : "✗"} · feed {health.configured.rssFeed ? "✓" : "✗"}</div>
            <div>MCP: {health.mcp.ok ? `OK (${health.mcp.ms} ms)` : `FAIL — ${health.mcp.error}`}</div>
            <div>RSS feed: {health.feed.ok ? `OK — ${health.feed.count} live legs (${health.feed.ms} ms)` : `FAIL — ${health.feed.error}`}</div>
          </div>
        )}
        {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-serif text-xl">Charter & empty-leg requests</h2>
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.isError ? (
          <p className="text-sm text-muted-foreground">Requests couldn't be loaded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2">Reference</th><th className="p-2">Type</th><th className="p-2">Route</th><th className="p-2">Date</th>
                  <th className="p-2">Pax</th><th className="p-2">Customer</th><th className="p-2">Status</th><th className="p-2">Partner trip</th><th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {(list.data?.items ?? []).filter((r) => r.status !== "estimated").map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="p-2 font-mono">{r.reference}</td>
                    <td className="p-2">{r.kind === "empty_leg" ? "Empty leg" : "Charter"}</td>
                    <td className="p-2">{r.origin} → {r.destination}{r.aircraft_category ? <div className="text-muted-foreground">{r.aircraft_category}</div> : null}</td>
                    <td className="p-2">{r.departure_date ?? "—"}{r.return_date ? ` / ${r.return_date}` : ""}</td>
                    <td className="p-2">{r.passengers}</td>
                    <td className="p-2">{r.customer_name}<div className="text-muted-foreground">{r.customer_email} · {r.customer_phone}</div></td>
                    <td className="p-2">{r.status}{r.last_error ? <div className="text-destructive">{String(r.last_error).slice(0, 120)}</div> : null}</td>
                    <td className="p-2">{r.supplier_trip_id ?? "—"}{r.supplier_status ? <div className="text-muted-foreground">{r.supplier_status}</div> : null}{r.supplier_tracking_link ? <a href={r.supplier_tracking_link} target="_blank" rel="noreferrer" className="block text-primary underline">listing</a> : null}</td>
                    <td className="p-2">{r.supplier_trip_id && <Button size="sm" variant="outline" onClick={() => refresh(r.id)}>Refresh</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
