import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  FileClock,
  Globe2,
  Loader2,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Webhook,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getIntegrationCenter,
  getIntegrationProductData,
  runAllIntegrationSyncs,
  runIntegrationSync,
  saveIntegrationProvider,
  testAllIntegrationConnections,
  testIntegrationConnection,
  updateIntegrationProviderFlags,
  updateIntegrationSettings,
} from "@/lib/integrations/integrations.functions";
import type {
  IntegrationAuditRow,
  IntegrationLogRow,
  IntegrationProductRow,
  IntegrationProvider,
  IntegrationProviderInput,
  IntegrationRunRow,
  IntegrationSettings,
} from "@/lib/integrations/types";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({
    meta: [
      { title: "API & Product Sync Center | Worldway Admin" },
      {
        name: "description",
        content: "Manage supplier APIs, product synchronization, health, webhooks and audit trails.",
      },
      { property: "og:title", content: "API & Product Sync Center | Worldway Admin" },
      {
        property: "og:description",
        content: "Manage supplier APIs, product synchronization, health, webhooks and audit trails.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationCenter,
});

type Center = {
  providers: IntegrationProvider[];
  settings: IntegrationSettings;
  products: { rows: IntegrationProductRow[]; total: number };
  runs: IntegrationRunRow[];
  logs: IntegrationLogRow[];
  audit: IntegrationAuditRow[];
  adapters: { id: string; label: string }[];
};

function ago(value: string | null) {
  if (!value) return "Never";
  const ms = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function connectionBadge(state: string) {
  if (state === "connected")
    return <Badge className="gap-1 bg-emerald-600 text-primary-foreground"><CheckCircle2 className="h-3 w-3" />Connected</Badge>;
  if (state === "error")
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Error</Badge>;
  return <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" />Not connected</Badge>;
}

function IntegrationCenter() {
  const getCenter = useServerFn(getIntegrationCenter);
  const testOne = useServerFn(testIntegrationConnection);
  const testAll = useServerFn(testAllIntegrationConnections);
  const syncOne = useServerFn(runIntegrationSync);
  const syncAll = useServerFn(runAllIntegrationSyncs);
  const changeSettings = useServerFn(updateIntegrationSettings);
  const changeFlags = useServerFn(updateIntegrationProviderFlags);
  const productData = useServerFn(getIntegrationProductData);
  const saveProvider = useServerFn(saveIntegrationProvider);
  const [center, setCenter] = useState<Center | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [apiData, setApiData] = useState<Record<string, unknown> | null>(null);

  async function reload(providerKey = selectedProvider) {
    setLoading(true);
    try {
      const result = await getCenter({ data: { ...(providerKey !== "all" ? { providerKey } : {}), productLimit: 100 } });
      setCenter(result as Center);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the Sync Center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload("all");
  }, []);

  async function action(key: string, run: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await run();
      toast.success(success);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  const providers = center?.providers ?? [];
  const products = useMemo(() => {
    const rows = center?.products.rows ?? [];
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter((p) => `${p.title} ${p.externalId} ${p.providerName}`.toLowerCase().includes(q))
      : rows;
  }, [center?.products.rows, query]);

  const connected = providers.filter((p) => p.connectionState === "connected").length;
  const errors = providers.filter((p) => p.connectionState === "error").length;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-primary">
            <ShieldCheck className="h-4 w-4" /> Operations control plane
          </div>
          <h1 className="mt-2 font-serif text-3xl text-primary">Universal API & Product Sync Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Provider controls, real connection health, unified product provenance and recoverable synchronization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void reload()} disabled={loading || busy !== null}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" onClick={() => void action("health-all", () => testAll(), "Health checks completed.")} disabled={busy !== null}>
            <Activity className="mr-2 h-4 w-4" /> Test all
          </Button>
          <Button onClick={() => void action("sync-all", () => syncAll({ data: { scope: "incremental" } }), "All enabled suppliers processed.")} disabled={busy !== null}>
            {busy === "sync-all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Sync all
          </Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add supplier/API</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Network} label="Suppliers" value={providers.length} />
        <Metric icon={CheckCircle2} label="Connected" value={connected} />
        <Metric icon={Database} label="Indexed products" value={center?.products.total ?? 0} />
        <Metric icon={RefreshCw} label="Sync runs" value={center?.runs.length ?? 0} />
        <Metric icon={AlertTriangle} label="Errors" value={errors} />
      </div>

      {center && (
        <div className="flex flex-wrap items-center gap-5 border-y border-border/60 py-3 text-sm">
          <Control label="Master API controls" checked={center.settings.globalEnabled} onChange={(checked) => void action("global", () => changeSettings({ data: { globalEnabled: checked } }), checked ? "API controls enabled." : "API controls disabled.")} />
          <Control label="Global auto sync" checked={center.settings.globalAutoSync} onChange={(checked) => void action("auto", () => changeSettings({ data: { globalAutoSync: checked } }), checked ? "Automatic sync enabled." : "Automatic sync disabled.")} />
          <Control label="Maintenance pause" checked={center.settings.maintenancePaused} onChange={(checked) => void action("pause", () => changeSettings({ data: { maintenancePaused: checked } }), checked ? "Sync paused." : "Sync resumed.")} />
          <span className="ml-auto text-xs text-muted-foreground">Credentials remain encrypted and server-side.</span>
        </div>
      )}

      <Tabs defaultValue="providers" className="space-y-5">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="providers">Suppliers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="runs">Sync runs</TabsTrigger>
          <TabsTrigger value="logs">API logs</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-3">
          {loading && !center ? <Loading /> : providers.map((p) => (
            <ProviderRow
              key={p.providerKey}
              provider={p}
              busy={busy}
              onTest={() => void action(`test:${p.providerKey}`, () => testOne({ data: { providerKey: p.providerKey } }), `${p.name} connection checked.`)}
              onSync={(scope) => void action(`sync:${p.providerKey}`, () => syncOne({ data: { providerKey: p.providerKey, scope } }), `${p.name} sync completed.`)}
              onEnabled={(enabled) => void action(`enabled:${p.providerKey}`, () => changeFlags({ data: { providerKey: p.providerKey, enabled } }), `${p.name} ${enabled ? "enabled" : "disabled"}.`)}
              onAuto={(autoSyncEnabled) => void action(`auto:${p.providerKey}`, () => changeFlags({ data: { providerKey: p.providerKey, autoSyncEnabled } }), `${p.name} auto sync updated.`)}
            />
          ))}
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <select value={selectedProvider} onChange={(e) => { setSelectedProvider(e.target.value); void reload(e.target.value); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">All suppliers</option>
              {providers.map((p) => <option key={p.providerKey} value={p.providerKey}>{p.name}</option>)}
            </select>
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find by product title or external ID" />
            </div>
          </div>
          <div className="overflow-x-auto border-y border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"><tr><th className="py-3 pr-4">Product</th><th className="px-3">Supplier</th><th className="px-3">API source / External ID</th><th className="px-3">Sync</th><th className="px-3">Last sync</th><th className="py-3 pl-3 text-right">Actions</th></tr></thead>
              <tbody>{products.map((p) => (
                <tr key={p.id} className="border-b border-border/40 align-top">
                  <td className="py-3 pr-4"><div className="font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.productType}</div></td>
                  <td className="px-3 py-3">{p.providerName}</td>
                  <td className="px-3 py-3"><div className="font-mono text-xs">{p.providerKey}</div><div className="font-mono text-xs text-muted-foreground">{p.externalId}</div></td>
                  <td className="px-3 py-3"><Badge variant={p.syncStatus === "synced" ? "secondary" : "outline"}>{p.syncStatus}</Badge>{p.conflictState !== "none" && <div className="mt-1 text-xs text-destructive">Conflict: {p.conflictState}</div>}</td>
                  <td className="px-3 py-3 text-muted-foreground">{ago(p.lastSyncedAt)}</td>
                  <td className="py-3 pl-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => void action(`product:${p.id}`, () => syncOne({ data: { providerKey: p.providerKey, scope: "product", externalId: p.externalId } }), `${p.title} synchronized.`)} disabled={busy !== null}><RefreshCw className="mr-1 h-3 w-3" />Sync now</Button><Button size="sm" variant="ghost" onClick={async () => { setBusy(`data:${p.id}`); try { const result = await productData({ data: { providerKey: p.providerKey, externalId: p.externalId } }); setApiData(result as unknown as Record<string, unknown>); setDataOpen(true); } finally { setBusy(null); } }}><Braces className="mr-1 h-3 w-3" />API data</Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!loading && products.length === 0 && <Empty text="No synchronized products match this view. Run a supplier sync to build the index." />}
        </TabsContent>

        <TabsContent value="runs"><Runs rows={center?.runs ?? []} /></TabsContent>
        <TabsContent value="logs"><Logs rows={center?.logs ?? []} /></TabsContent>
        <TabsContent value="audit"><Audit rows={center?.audit ?? []} /></TabsContent>
      </Tabs>

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} onSave={async (data) => { await action("add", () => saveProvider({ data }), "Supplier/API saved and ready for connection testing."); setAddOpen(false); }} />
      <Dialog open={dataOpen} onOpenChange={setDataOpen}><DialogContent className="max-h-[80vh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>Sanitized supplier data</DialogTitle><DialogDescription>Credential fields are removed before records and logs are stored.</DialogDescription></DialogHeader><pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(apiData, null, 2)}</pre></DialogContent></Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return <div className="border-l-2 border-primary/60 bg-card/40 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div><div className="mt-2 font-serif text-2xl text-primary">{value.toLocaleString()}</div></div>;
}

function Control({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2"><Switch checked={checked} onCheckedChange={onChange} /><span>{label}</span></label>;
}

function ProviderRow({ provider: p, busy, onTest, onSync, onEnabled, onAuto }: { provider: IntegrationProvider; busy: string | null; onTest: () => void; onSync: (scope: "full" | "incremental") => void; onEnabled: (v: boolean) => void; onAuto: (v: boolean) => void }) {
  return <section className="border-y border-border/60 bg-card/30 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-serif text-xl text-primary">{p.name}</h2>{connectionBadge(p.connectionState)}{!p.enabled && <Badge variant="outline">Disabled</Badge>}</div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{p.summary}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Source <strong className="text-foreground">{p.adapter ?? "Generic API"}</strong></span><span>Products <strong className="text-foreground">{p.productCount}</strong></span><span>Last sync <strong className="text-foreground">{ago(p.lastSyncAt)}</strong></span><span>Strategy <strong className="text-foreground">{p.syncStrategy}</strong></span><span>Rate <strong className="text-foreground">{p.rateLimitPerSecond}/s</strong></span></div>{p.connectionDetail && <p className="mt-2 text-xs text-muted-foreground">{p.connectionDetail}</p>}{p.missingSecrets.length > 0 && <p className="mt-2 text-xs text-amber-600">Awaiting secure credentials: {p.missingSecrets.join(", ")}</p>}</div>
      <div className="flex flex-wrap items-center justify-end gap-2"><Button size="sm" variant="outline" onClick={onTest} disabled={busy !== null}><Activity className="mr-1 h-3 w-3" />Test connection</Button><Button size="sm" variant="outline" onClick={() => onSync("incremental")} disabled={busy !== null}><RefreshCw className="mr-1 h-3 w-3" />Incremental</Button><Button size="sm" onClick={() => onSync("full")} disabled={busy !== null}>{busy === `sync:${p.providerKey}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}Sync now</Button></div></div>
    <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-border/50 pt-3 text-xs"><Control label="API enabled" checked={p.enabled} onChange={onEnabled} /><Control label="Auto sync" checked={p.autoSyncEnabled} onChange={onAuto} /><span className="flex items-center gap-1 text-muted-foreground"><Webhook className="h-3 w-3" />{p.webhookSecretName ? p.webhookPath : "Webhook not configured"}</span><span className="ml-auto font-mono text-muted-foreground">{p.providerKey}</span></div>
  </section>;
}

function Runs({ rows }: { rows: IntegrationRunRow[] }) { return <div className="space-y-2">{rows.map((r) => <div key={r.id} className="grid gap-2 border-b border-border/50 py-3 text-sm md:grid-cols-[1.2fr_.7fr_.7fr_2fr_auto]"><span className="font-medium">{r.providerKey}</span><span>{r.scope} · {r.trigger}</span><Badge className="w-fit" variant={r.status === "failed" ? "destructive" : r.status === "success" ? "secondary" : "outline"}>{r.status}</Badge><span className="text-xs text-muted-foreground">{r.discovered} found · {r.created} new · {r.updated} updated · {r.failed} failed{r.error ? ` · ${r.error}` : ""}</span><span className="text-xs text-muted-foreground">{ago(r.startedAt)}</span></div>)}{rows.length === 0 && <Empty text="No synchronization runs recorded yet." />}</div>; }

function Logs({ rows }: { rows: IntegrationLogRow[] }) { return <div className="space-y-2">{rows.map((r) => <div key={r.id} className="grid gap-2 border-b border-border/50 py-3 text-sm md:grid-cols-[1.1fr_1fr_.5fr_2fr_auto]"><span className="font-medium">{r.providerKey}</span><span>{r.operation}</span><span>{r.httpStatus ?? "—"}</span><span className="text-xs text-muted-foreground">{r.message ?? r.status}</span><span className="text-xs text-muted-foreground">{r.latencyMs ? `${r.latencyMs}ms` : ago(r.createdAt)}</span></div>)}{rows.length === 0 && <Empty text="No API activity recorded yet." />}</div>; }

function Audit({ rows }: { rows: IntegrationAuditRow[] }) { return <div className="space-y-2">{rows.map((r) => <div key={r.id} className="grid gap-2 border-b border-border/50 py-3 text-sm md:grid-cols-[1fr_1.3fr_2fr_auto]"><span>{r.actorEmail ?? "System"}</span><span className="font-medium">{r.action}</span><span className="font-mono text-xs text-muted-foreground">{r.providerKey ?? "global"}</span><span className="text-xs text-muted-foreground">{ago(r.createdAt)}</span></div>)}{rows.length === 0 && <Empty text="No integration administration recorded yet." />}</div>; }

function Loading() { return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading supplier control plane…</div>; }
function Empty({ text }: { text: string }) { return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>; }

type AddData = IntegrationProviderInput;

function AddProviderDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (data: AddData) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", providerKey: "", category: "other", summary: "", baseUrl: "", authKind: "api-key-header", authHeader: "", secretNames: "", catalogPath: "", healthPath: "", capabilities: "catalog", collections: "", syncStrategy: "full", paginationMode: "none", recordPath: "", fieldMap: "{}", dedupeKeys: "external_id", conflictPolicy: "supplier-wins", webhookSecretName: "", docsUrl: "", notes: "" });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function submit() {
    let fieldMap: Record<string, string> = {};
    try { fieldMap = JSON.parse(form.fieldMap) as Record<string, string>; } catch { toast.error("Field mapping must be valid JSON."); return; }
    await onSave({ providerKey: form.providerKey, name: form.name, category: form.category, summary: form.summary, baseUrl: form.baseUrl, authKind: form.authKind as AddData["authKind"], authHeader: form.authHeader || undefined, secretNames: form.secretNames.split(",").map((v) => v.trim()).filter(Boolean), catalogPath: form.catalogPath || undefined, healthPath: form.healthPath || undefined, capabilities: form.capabilities.split(",").map((v) => v.trim()).filter(Boolean), collections: form.collections.split(",").map((v) => v.trim()).filter(Boolean), rateLimitPerSecond: 5, maxRetries: 3, timeoutMs: 12000, syncStrategy: form.syncStrategy as AddData["syncStrategy"], paginationMode: form.paginationMode as AddData["paginationMode"], recordPath: form.recordPath || undefined, fieldMap, dedupeKeys: form.dedupeKeys.split(",").map((v) => v.trim()).filter(Boolean), conflictPolicy: form.conflictPolicy as AddData["conflictPolicy"], webhookSecretName: form.webhookSecretName, docsUrl: form.docsUrl, notes: form.notes });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Add New Supplier/API</DialogTitle><DialogDescription>Configure only documented endpoints and secret names. Credentials are added separately to secure server storage; this form never accepts secret values.</DialogDescription></DialogHeader><div className="grid gap-4 md:grid-cols-2"><Field label="Supplier name"><Input value={form.name} onChange={(e) => { set("name", e.target.value); if (!form.providerKey) set("providerKey", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></Field><Field label="Provider key"><Input value={form.providerKey} onChange={(e) => set("providerKey", e.target.value)} /></Field><Field label="Category"><Input value={form.category} onChange={(e) => set("category", e.target.value)} /></Field><Field label="Base URL"><Input value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://api.supplier.com" /></Field><Field label="Authentication"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.authKind} onChange={(e) => set("authKind", e.target.value)}>{["api-key-header","bearer-token","basic","header-pair","oauth2-client-credentials","signed-session","none"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Auth header"><Input value={form.authHeader} onChange={(e) => set("authHeader", e.target.value)} placeholder="X-API-Key" /></Field><Field label="Required secret names"><Input value={form.secretNames} onChange={(e) => set("secretNames", e.target.value)} placeholder="SUPPLIER_API_KEY, SUPPLIER_SECRET" /></Field><Field label="Catalogue endpoint"><Input value={form.catalogPath} onChange={(e) => set("catalogPath", e.target.value)} placeholder="/v1/products" /></Field><Field label="Health endpoint"><Input value={form.healthPath} onChange={(e) => set("healthPath", e.target.value)} placeholder="/v1/status" /></Field><Field label="Record path"><Input value={form.recordPath} onChange={(e) => set("recordPath", e.target.value)} placeholder="data.products" /></Field><Field label="Capabilities"><Input value={form.capabilities} onChange={(e) => set("capabilities", e.target.value)} placeholder="catalog, availability, pricing" /></Field><Field label="Collections"><Input value={form.collections} onChange={(e) => set("collections", e.target.value)} placeholder="tours, activities" /></Field><Field label="Sync strategy"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.syncStrategy} onChange={(e) => set("syncStrategy", e.target.value)}>{["full","cursor","updated-since","index"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Pagination"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.paginationMode} onChange={(e) => set("paginationMode", e.target.value)}>{["none","page","offset","cursor"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Deduplication keys"><Input value={form.dedupeKeys} onChange={(e) => set("dedupeKeys", e.target.value)} /></Field><Field label="Conflict handling"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.conflictPolicy} onChange={(e) => set("conflictPolicy", e.target.value)}>{["supplier-wins","local-wins","manual-review"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Webhook secret name"><Input value={form.webhookSecretName} onChange={(e) => set("webhookSecretName", e.target.value)} placeholder="SUPPLIER_WEBHOOK_SECRET" /></Field><Field label="Documentation URL"><Input value={form.docsUrl} onChange={(e) => set("docsUrl", e.target.value)} /></Field><Field label="Field mapping JSON" wide><Textarea rows={5} value={form.fieldMap} onChange={(e) => set("fieldMap", e.target.value)} placeholder={'{"supplierId":"code","productName":"title"}'} /></Field><Field label="Summary / operational notes" wide><Textarea value={`${form.summary}${form.summary && form.notes ? "\n" : ""}${form.notes}`} onChange={(e) => { set("summary", e.target.value); set("notes", e.target.value); }} /></Field></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={!form.name || !form.providerKey}><Plus className="mr-2 h-4 w-4" />Save supplier</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`space-y-1.5 text-xs text-muted-foreground ${wide ? "md:col-span-2" : ""}`}><span>{label}</span>{children}</label>; }