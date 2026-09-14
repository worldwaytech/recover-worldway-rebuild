import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { refreshPartnerManifest, getPartnerManifest } from "@/lib/wwl.functions";
import { admin, ENDPOINTS, type ApiKey } from "@/lib/admin-store";
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
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  void tick;
  const keys = admin.apiKeys(),
    hooks = admin.webhooks();
  const totalReq = keys.reduce((s, k) => s + k.requests, 0);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active keys"
          value={String(keys.filter((k) => k.status === "active").length)}
        />
        <StatTile label="Requests (30d)" value={totalReq.toLocaleString()} />
        <StatTile label="Endpoints" value={String(ENDPOINTS.length)} />
        <StatTile label="Webhooks" value={String(hooks.length)} />
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="keys">
          <KeysPanel keys={keys} refresh={refresh} />
        </TabsContent>
        <TabsContent value="endpoints">
          <EndpointsPanel />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhooksPanel refresh={refresh} />
        </TabsContent>
        <TabsContent value="usage">
          <UsagePanel keys={keys} />
        </TabsContent>
      </Tabs>
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

function KeysPanel({ keys, refresh }: { keys: ApiKey[]; refresh: () => void }) {
  const [name, setName] = useState("");
  const [env, setEnv] = useState<ApiKey["environment"]>("production");
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2 border-b border-border/40 p-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key label — e.g. Mobile app"
          className="w-72"
        />
        <select
          value={env}
          onChange={(e) => setEnv(e.target.value as ApiKey["environment"])}
          className="rounded-md border border-border/60 bg-background px-2 py-2 text-sm"
        >
          <option value="production">production</option>
          <option value="staging">staging</option>
          <option value="sandbox">sandbox</option>
        </select>
        <Button
          onClick={() => {
            if (!name) return;
            admin.createApiKey(name, env, ["read:catalog", "write:booking"]);
            setName("");
            refresh();
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Create key
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => (
            <TableRow key={k.id}>
              <TableCell className="font-medium">{k.name}</TableCell>
              <TableCell className="text-xs uppercase tracking-widest text-muted-foreground">
                {k.environment}
              </TableCell>
              <TableCell className="font-mono text-xs">{mask(k.key)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{k.scopes.join(", ")}</TableCell>
              <TableCell>{k.requests.toLocaleString()}</TableCell>
              <TableCell>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] ${k.status === "active" ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive"}`}
                >
                  {k.status}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard?.writeText(k.key)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.rotateApiKey(k.id);
                    refresh();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.revokeApiKey(k.id);
                    refresh();
                  }}
                >
                  <Ban className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.removeApiKey(k.id);
                    refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function EndpointsPanel() {
  const groups = ENDPOINTS.reduce<Record<string, typeof ENDPOINTS>>((acc, e) => {
    (acc[e.category] ||= []).push(e);
    return acc;
  }, {});
  return (
    <div className="mt-4 space-y-4">
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat} className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
          <div className="border-b border-border/40 px-4 py-3 text-xs uppercase tracking-[0.25em] text-primary">
            {cat}
          </div>
          <ul className="divide-y divide-border/40">
            {list.map((e) => (
              <li key={e.path} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span
                  className={`inline-block w-16 rounded-md px-2 py-0.5 text-center text-[0.65rem] font-semibold uppercase tracking-wider ${e.method === "GET" ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-500"}`}
                >
                  {e.method}
                </span>
                <code className="font-mono text-xs text-foreground">{e.path}</code>
                <span className="ml-auto text-xs text-muted-foreground">{e.description}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
                  {e.auth ? "Bearer" : "Public"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WebhooksPanel({ refresh }: { refresh: () => void }) {
  const [url, setUrl] = useState("");
  const hooks = admin.webhooks();
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2 border-b border-border/40 p-4">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-app.com/webhooks/wwl"
          className="w-96"
        />
        <Button
          onClick={() => {
            if (!url) return;
            admin.createWebhook(url, ["booking.confirmed"]);
            setUrl("");
            refresh();
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add webhook
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead>Events</TableHead>
            <TableHead>Secret</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {hooks.map((h) => (
            <TableRow key={h.id}>
              <TableCell className="font-mono text-xs">{h.url}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{h.events.join(", ")}</TableCell>
              <TableCell className="font-mono text-xs">{h.secret.slice(0, 12)}••••</TableCell>
              <TableCell>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] ${h.status === "active" ? "border-primary/40 text-primary" : "border-border/60 text-muted-foreground"}`}
                >
                  {h.status}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.toggleWebhook(h.id);
                    refresh();
                  }}
                >
                  {h.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    admin.removeWebhook(h.id);
                    refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function UsagePanel({ keys }: { keys: ApiKey[] }) {
  const total = keys.reduce((s, k) => s + k.requests, 0) || 1;
  return (
    <Card>
      <div className="p-6">
        <div className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Requests by key (last 30 days)
        </div>
        <ul className="space-y-3">
          {keys.map((k) => {
            const pct = Math.max(2, Math.round((k.requests / total) * 100));
            return (
              <li key={k.id}>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{k.name}</span>
                  <span>
                    {k.requests.toLocaleString()} · {pct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-background/60">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "var(--gradient-gold)" }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
