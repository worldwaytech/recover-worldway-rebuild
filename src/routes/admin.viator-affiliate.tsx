import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getViatorAffiliateOps, probeViatorAffiliate } from "@/lib/admin/product-ops.functions";
import { DataTable, Stat } from "@/components/admin/product-ops-panel";

export const Route = createFileRoute("/admin/viator-affiliate")({
  head: () => ({
    meta: [
      { title: "Viator Affiliate — Worldway Admin" },
      { name: "description", content: "Viator Affiliate (Partner API) health, configuration, probes and booking-flow status." },
      { property: "og:title", content: "Viator Affiliate — Worldway Admin" },
      { property: "og:description", content: "Viator Affiliate connector operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ViatorAffiliatePage,
});

const FLOW = ["availability", "hold", "payment_form", "book", "status", "cancel"];

function ViatorAffiliatePage() {
  const fetchOps = useServerFn(getViatorAffiliateOps);
  const runProbe = useServerFn(probeViatorAffiliate);
  const q = useQuery({ queryKey: ["admin-viator-affiliate"], queryFn: () => fetchOps() });
  const [destination, setDestination] = useState("Paris");
  const [code, setCode] = useState("");
  const [probe, setProbe] = useState<Awaited<ReturnType<typeof runProbe>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doProbe() {
    setBusy(true);
    setErr(null);
    try {
      setProbe(await runProbe({ data: { destination, ...(code.trim() ? { productCode: code.trim() } : {}) } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Probe failed");
    } finally {
      setBusy(false);
    }
  }

  const d = q.data;
  const access = d?.status && "bookingAccess" in d.status ? d.status.bookingAccess : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Viator Affiliate</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Partner API (Affiliate) used by the customer Activities pages. Completely separate from Viator Merchant,
            which has its own sandbox key and console.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/viator-diagnostics" className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:text-primary">Diagnostic export →</Link>
          <Link to="/admin/viator-merchant" className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:text-primary">Viator Merchant (separate) →</Link>
          <button onClick={() => q.refetch()} className="rounded-full border border-border/60 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
            {q.isFetching ? "Checking…" : "Re-check health"}
          </button>
        </div>
      </div>

      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Configuration" value={d.configured ? "Configured" : "Missing key"} note={`Secret ${d.secret} (server-side)`} />
            <Stat label="Environment" value={d.environment} />
            <Stat
              label="Connector health"
              value={d.status && "reachable" in d.status ? (d.status.reachable ? "Reachable" : "Unreachable") : "—"}
              note={d.status?.message ?? undefined}
            />
            <Stat
              label="Booking access"
              value={access ? (access.granted === true ? "Granted" : access.granted === false ? "Denied (403)" : "Unknown") : "—"}
              note={access?.detail}
            />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Booking-flow status (recent traces)</h2>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {FLOW.map((s) => {
                const st = d.steps[s];
                return (
                  <div key={s} className="rounded-lg border border-border/60 p-3 text-xs">
                    <div className="uppercase tracking-widest text-muted-foreground">{s.replace("_", " ")}</div>
                    <div className="mt-1 text-foreground">{st ? `${st.calls} calls · ${st.failures} failed` : "No calls"}</div>
                    {st?.last && <div className="text-muted-foreground">{new Date(st.last).toLocaleString()}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="space-y-3 rounded-xl border border-border/60 p-4">
        <h2 className="text-sm font-medium text-foreground">Search / availability probe (read-only)</h2>
        <div className="flex flex-wrap gap-2">
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Product code (optional)" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <button onClick={doProbe} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
            {busy ? "Probing…" : "Run probe"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Calls product search and the availability schedule only — never hold or book.</p>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {probe && <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 text-xs">{JSON.stringify(probe, null, 2)}</pre>}
      </section>

      {d && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Recent activity bookings ({d.bookings.count})</h2>
            <DataTable rows={d.bookings.rows} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Recent API activity</h2>
            <DataTable rows={d.traces} />
          </section>
        </>
      )}
    </div>
  );
}
