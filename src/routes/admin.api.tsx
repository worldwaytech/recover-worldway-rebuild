import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { refreshPartnerManifest, getPartnerManifest } from "@/lib/wwl.functions";
import { OPENAPI_SPEC, API_SCOPES } from "@/lib/commerce/openapi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, RefreshCw, Ban, Plus, Trash2, Network } from "lucide-react";
import { StatTile } from "@/components/portal-shell";

export const Route = createFileRoute("/admin/api")({
  head: () => ({ meta: [{ title: "API Management — Worldway Travels Group" }] }),
  component: ApiPage,
});

function mask(k: string) {
  return `${k.slice(0, 12)}••••${k.slice(-4)}`;
}

function ApiPage() {

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">
          Developer platform
        </div>
        <h1 className="mt-2 font-serif text-3xl text-primary">API Management</h1>
        <p className="text-sm text-muted-foreground">
          Keys, webhooks, endpoints, and usage across the Worldway partner platform.
        </p>
      </div>

      <PartnerManifestPanel />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Network className="h-4 w-4" /> Universal API & Product Sync Center
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage every supplier, health check, product index, webhook and synchronisation run.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/integrations">Open Sync Center</Link>
        </Button>
      </div>

      <DeveloperPortal />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card/60"
      style={{ boxShadow: "var(--shadow-portal)" }}
    >
      {children}
    </div>
  );
}

function PartnerManifestPanel() {
  const runRefresh = useServerFn(refreshPartnerManifest);
  const runGet = useServerFn(getPartnerManifest);
  const [state, setState] = useState<{
    version: string | null;
    endpoints: number | null;
    fetchedAt: number | null;
    loading: boolean;
    error: string | null;
    msg: string | null;
  }>({
    version: null,
    endpoints: null,
    fetchedAt: null,
    loading: false,
    error: null,
    msg: null,
  });

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null, msg: null }));
    try {
      const r = await runGet();
      setState((s) => ({
        ...s,
        loading: false,
        version: r.version,
        endpoints: r.endpoints?.length ?? 0,
        fetchedAt: r.fetchedAt,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load manifest",
      }));
    }
  }

  async function doRefresh() {
    setState((s) => ({ ...s, loading: true, error: null, msg: null }));
    try {
      const r = await runRefresh();
      setState((s) => ({
        ...s,
        loading: false,
        version: r.version,
        endpoints: r.endpoints,
        fetchedAt: Date.now(),
        msg: r.ok
          ? `Manifest refreshed — ${r.endpoints} endpoints, v${r.version ?? "?"}`
          : "Refresh returned no manifest",
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Refresh failed",
      }));
    }
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6"
      style={{ boxShadow: "var(--shadow-portal)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">
            Worldwayluxe partner
          </div>
          <h2 className="mt-1 font-serif text-xl text-primary">Live manifest</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pulls the latest endpoints (flights, hotels, jets, concierge tools) from
            worldwayluxe.com. Concierge replies are already live — this only refreshes route
            discovery.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={state.loading}
            className="rounded-md border border-border/60 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground disabled:opacity-50"
          >
            Check
          </button>
          <button
            onClick={doRefresh}
            disabled={state.loading}
            className="rounded-md bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            {state.loading ? "Refreshing…" : "Refresh manifest"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <div className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">
            Version
          </div>
          <div className="mt-1 font-mono">{state.version ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <div className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">
            Endpoints
          </div>
          <div className="mt-1 font-mono">{state.endpoints ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <div className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">
            Fetched
          </div>
          <div className="mt-1 font-mono">
            {state.fetchedAt ? new Date(state.fetchedAt).toLocaleString() : "—"}
          </div>
        </div>
      </div>
      {state.msg ? <div className="mt-3 text-xs text-primary">{state.msg}</div> : null}
      {state.error ? <div className="mt-3 text-xs text-destructive">{state.error}</div> : null}
    </div>
  );
}


const BASE = "https://worldwaytravelsgroup.com/api/v1";

function DeveloperPortal() {
  const paths = Object.entries(OPENAPI_SPEC.paths) as [string, { post: { summary: string; description: string; requestBody: { content: { "application/json": { example: object } } } } }][];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div>
          <div className="text-sm font-semibold text-primary">Partner keys, scopes, limits & usage</div>
          <p className="mt-1 text-xs text-muted-foreground">Create partners, issue/rotate/revoke keys, choose products (scopes), set rate limits, suspend access and view usage. Super Admin only; every change is audited.</p>
        </div>
        <Button asChild><Link to="/admin/commerce-api">Manage partners & keys</Link></Button>
      </div>
      <Card>
        <div className="space-y-4 p-6 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-primary">API documentation (OpenAPI 3.1)</h2>
            <a className="text-xs underline" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">openapi.json</a>
          </div>
          <p>Production base URL: <code>{BASE}</code></p>
          <p className="text-muted-foreground">Authentication: <code>X-Api-Key: wwk_live_…</code> or <code>Authorization: Bearer &lt;key or partner user token&gt;</code> (add <code>X-Worldway-Tenant</code> when a user belongs to several partners). Keys are stored only as hashes and shown once.</p>
          <Table>
            <TableHeader><TableRow><TableHead>Scope</TableHead><TableHead>Product</TableHead><TableHead>Operations</TableHead></TableRow></TableHeader>
            <TableBody>{API_SCOPES.map((s) => <TableRow key={s.scope}><TableCell><code>{s.scope}</code></TableCell><TableCell>{s.product}</TableCell><TableCell>{s.ops.join(", ")}</TableCell></TableRow>)}</TableBody>
          </Table>
          {paths.map(([path, d]) => (
            <div key={path} className="rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="font-mono text-xs"><span className="text-primary">POST</span> {path} — {d.post.summary}</div>
              <p className="mt-1 text-xs text-muted-foreground">{d.post.description}</p>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px]">{`curl -X POST ${BASE}${path} \\
  -H "X-Api-Key: $WORLDWAY_API_KEY" -H "Content-Type: application/json" \\
  -d '${JSON.stringify(d.post.requestBody.content["application/json"].example)}'`}</pre>
            </div>
          ))}
          <div>
            <h3 className="font-semibold">Errors</h3>
            <p className="text-xs text-muted-foreground">400 invalid input · 401 bad/expired/revoked credentials · 403 missing scope or suspended partner · 404 unknown operation · 422 not fulfillable · 429 rate limited (Retry-After) · 500 internal. Body: <code>{`{"ok":false,"error":"…"}`}</code></p>
          </div>
          <div>
            <h3 className="font-semibold">Webhooks</h3>
            <p className="text-xs text-muted-foreground">{OPENAPI_SPEC["x-webhooks-status"]}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
