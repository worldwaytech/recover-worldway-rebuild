import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminAviationHealth,
  adminListAviationRequests,
  adminRefreshAviationStatus,
  adminSetConfirmedQuote,
} from "@/lib/aviation/private-aviation.functions";
import { Button } from "@/components/ui/button";

export function AviationDesk() {
  const healthFn = useServerFn(adminAviationHealth);
  const listFn = useServerFn(adminListAviationRequests);
  const refreshFn = useServerFn(adminRefreshAviationStatus);
  const quoteFn = useServerFn(adminSetConfirmedQuote);
  const [quoting, setQuoting] = useState<any | null>(null);
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
                    <td className="space-y-1 p-2">
                      {r.supplier_trip_id && <Button size="sm" variant="outline" onClick={() => refresh(r.id)}>Refresh</Button>}
                      {!r.paid_at && <Button size="sm" onClick={() => setQuoting(r)}>{r.quote_version ? "Re-quote" : "Enter quote"}</Button>}
                      {r.quote_amount ? <div className="text-muted-foreground">{r.quote_currency} {r.quote_amount} v{r.quote_version}</div> : null}
                      {r.receipt_number ? <div className="text-primary">{r.receipt_number}</div> : null}
                      {Array.isArray(r.email_log) && r.email_log.length ? <div className="text-muted-foreground">emails: {r.email_log.map((e: any) => `${e.kind}:${e.status}`).join(", ")}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {quoting && (
        <QuoteForm
          row={quoting}
          onCancel={() => setQuoting(null)}
          onSubmit={async (v) => {
            const r = await quoteFn({ data: { id: quoting.id, ...v } });
            setMsg(r.ok ? `Quote v${r.version} saved for ${quoting.reference} (email: ${r.emailStatus}).` : r.error);
            if (r.ok) setQuoting(null);
            qc.invalidateQueries({ queryKey: ["admin-aviation-requests"] });
          }}
        />
      )}
    </section>
  );
}

function QuoteForm({ row, onCancel, onSubmit }: { row: any; onCancel: () => void; onSubmit: (v: { amount: number; currency: "INR" | "USD" | "GBP" | "EUR" | "AED"; aircraft: string; inclusions?: string; expiresAt: string }) => Promise<void> }) {
  const [amount, setAmount] = useState(String(row.quote_amount ?? ""));
  const [currency, setCurrency] = useState<"INR" | "USD" | "GBP" | "EUR" | "AED">(row.quote_currency ?? "USD");
  const [aircraft, setAircraft] = useState(row.quote_details?.aircraft ?? row.aircraft_category ?? "");
  const [inclusions, setInclusions] = useState(row.quote_details?.inclusions ?? "");
  const [hours, setHours] = useState("48");
  const cls = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
  return (
    <div className="rounded-xl border border-primary/50 bg-card p-5 text-sm">
      <h3 className="font-serif text-lg">Confirmed quote for {row.reference}</h3>
      <p className="text-xs text-muted-foreground">Enter the final Worldway customer price (including any Worldway margin) from the operator's confirmed options. The customer pays exactly this amount.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <input aria-label="Amount" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={cls} placeholder="Amount" />
        <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as any)} className={cls}>
          {["USD", "GBP", "EUR", "AED", "INR"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <input aria-label="Aircraft" value={aircraft} onChange={(e) => setAircraft(e.target.value)} className={cls} placeholder="Aircraft" />
        <input aria-label="Valid for hours" type="number" min={1} max={720} value={hours} onChange={(e) => setHours(e.target.value)} className={cls} />
        <textarea aria-label="Inclusions" rows={2} value={inclusions} onChange={(e) => setInclusions(e.target.value)} className={`${cls} md:col-span-4`} placeholder="Inclusions, taxes, catering, cancellation terms (customer-facing, no partner names)" />
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => onSubmit({ amount: Number(amount), currency, aircraft, inclusions: inclusions || undefined, expiresAt: new Date(Date.now() + Number(hours) * 3600_000).toISOString() })}>Save & notify customer</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
