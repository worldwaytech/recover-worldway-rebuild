import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getBokunMarketplaceOverview,
  runBokunMarketplaceSync,
  runBokunSmokeTest,
  verifyBokunEnvironment,
} from "@/lib/bokun/bokun.functions";

export const Route = createFileRoute("/admin/bokun")({
  head: () => ({ meta: [{ title: "Bókun Marketplace — Admin" }] }),
  component: AdminBokunPage,
});

type Run = {
  id: string; scope: string; trigger: string; status: string; started_at: string;
  suppliers: number; discovered: number; created_count: number; updated_count: number;
  unchanged_count: number; deactivated_count: number; failed_count: number; errors: string[];
};

function AdminBokunPage() {
  const overviewFn = useServerFn(getBokunMarketplaceOverview);
  const syncFn = useServerFn(runBokunMarketplaceSync);
  const verifyFn = useServerFn(verifyBokunEnvironment);
  const smokeFn = useServerFn(runBokunSmokeTest);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bokun-overview"], queryFn: () => overviewFn() });
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      setOutput(JSON.stringify(await fn(), null, 2));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["bokun-overview"] });
    }
  };

  const o = q.data;
  const runs = (o?.runs ?? []) as Run[];
  const btn = "rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground disabled:opacity-50";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Bókun Marketplace</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Channel-manager sync into the Tours Marketplace. Credentials and supplier IDs stay server-side. Live booking is{" "}
        <strong>{o?.bookingsEnabled ? "ENABLED" : "DISABLED"}</strong>.
      </p>

      {q.error && <p className="mt-4 text-sm text-destructive">{(q.error as Error).message}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Health", o?.health ?? "…"],
          ["Environment", o?.environment ?? "…"],
          ["Suppliers", o?.suppliers.length ?? "…"],
          ["Active products", o?.activeProducts ?? "…"],
          ["Inactive products", o?.inactiveProducts ?? "…"],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{String(v)}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button disabled={!!busy} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          onClick={() => run("full", () => syncFn({ data: { scope: "full" } }))}>
          {busy === "full" ? "Syncing…" : "Full sync"}
        </button>
        <button disabled={!!busy} className={btn} onClick={() => run("inc", () => syncFn({ data: { scope: "incremental" } }))}>
          {busy === "inc" ? "Syncing…" : "Incremental sync"}
        </button>
        <button disabled={!!busy} className={btn} onClick={() => run("verify", () => verifyFn())}>Verify environment</button>
        <button disabled={!!busy} className={btn} onClick={() => run("smoke", () => smokeFn())}>Read-only smoke test</button>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-foreground">Suppliers / contracts</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr><th>Supplier ID</th><th>Products</th><th>Status</th><th>Last seen</th><th>Error</th></tr></thead>
        <tbody>
          {(o?.suppliers ?? []).map((s: { supplier_id: string; product_count: number; status: string; last_seen_at: string; last_error: string | null }) => (
            <tr key={s.supplier_id} className="border-t border-border">
              <td>{s.supplier_id}</td><td>{s.product_count}</td><td>{s.status}</td>
              <td>{new Date(s.last_seen_at).toLocaleString()}</td><td>{s.last_error ?? "—"}</td>
            </tr>
          ))}
          {o && o.suppliers.length === 0 && <tr><td colSpan={5} className="py-2 text-muted-foreground">No sync yet.</td></tr>}
        </tbody>
      </table>

      <h2 className="mt-8 text-lg font-semibold text-foreground">Sync log</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr><th>Started</th><th>Scope</th><th>Status</th><th>Discovered</th><th>New / Upd / Same</th><th>Deact.</th><th>Failed</th><th>Errors</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td>{new Date(r.started_at).toLocaleString()}</td><td>{r.scope} ({r.trigger})</td><td>{r.status}</td>
              <td>{r.discovered}</td><td>{r.created_count} / {r.updated_count} / {r.unchanged_count}</td>
              <td>{r.deactivated_count}</td><td>{r.failed_count}</td>
              <td className="max-w-xs text-xs text-muted-foreground">{r.errors?.join("; ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {output && (
        <pre className="mt-6 max-h-[420px] overflow-auto rounded-xl border border-border bg-muted p-4 text-xs text-foreground">{output}</pre>
      )}
    </main>
  );
}
