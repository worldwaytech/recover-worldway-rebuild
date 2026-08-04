import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PARTNER_CONNECTORS } from "@/lib/partners/registry";
import { getPartnerHealth, runPartnerSync } from "@/lib/partners/partners.functions";
import type { PartnerHealth, PartnerLogEntry } from "@/lib/partners/types";
import { RefreshCw, PlugZap, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/partners")({
  head: () => ({
    meta: [
      { title: "Partner connectors — Worldway Admin" },
      {
        name: "description",
        content:
          "Monitor luxury partner connectors, credentials, health and catalogue synchronisation.",
      },
    ],
  }),
  component: PartnersConsole,
});

type SyncRow = {
  partnerId: string;
  partnerName: string;
  mode: string;
  received: number;
  created: number;
  updated: number;
  fromCache: boolean;
  durationMs: number;
  warnings: string[];
  syncedAt: string;
};

function modeBadge(mode: string) {
  if (mode === "live") return <Badge className="bg-emerald-600 text-white">Live</Badge>;
  if (mode === "disabled") return <Badge variant="outline">Disabled</Badge>;
  return <Badge variant="secondary">Demonstration</Badge>;
}

function PartnersConsole() {
  const fetchHealth = useServerFn(getPartnerHealth);
  const sync = useServerFn(runPartnerSync);
  const [health, setHealth] = useState<PartnerHealth[]>([]);
  const [logs, setLogs] = useState<PartnerLogEntry[]>([]);
  const [syncRows, setSyncRows] = useState<SyncRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetchHealth();
      setHealth(res.health as PartnerHealth[]);
      setLogs(res.logs as PartnerLogEntry[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load connector health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSync(partnerId?: string) {
    setBusy(partnerId ?? "all");
    try {
      const res = await sync({ data: { partnerId, force: true } });
      setSyncRows(res.results as SyncRow[]);
      toast.success(partnerId ? "Connector synchronised" : "All connectors synchronised");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  const liveCount = health.filter((h) => h.mode === "live").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Partner connectors</h1>
          <p className="text-sm text-muted-foreground">
            {liveCount} of {PARTNER_CONNECTORS.length} connectors are running on live credentials.
            The remainder serve clearly badged demonstration inventory — switching to live data
            requires connector credentials only, no code changes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Re-check
            health
          </Button>
          <Button onClick={() => void doSync()} disabled={busy !== null}>
            <PlugZap className="mr-2 h-4 w-4" /> Sync all catalogues
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PARTNER_CONNECTORS.map((cfg) => {
          const h = health.find((x) => x.id === cfg.id);
          const row = syncRows.find((x) => x.partnerId === cfg.id);
          return (
            <Card key={cfg.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{cfg.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{cfg.summary}</p>
                  </div>
                  {modeBadge(h?.mode ?? "demonstration")}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex flex-wrap gap-1">
                  {cfg.capabilities.map((c) => (
                    <Badge key={c} variant="outline" className="font-normal">
                      {c}
                    </Badge>
                  ))}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <dt>Contract</dt>
                  <dd className="text-right text-foreground">{cfg.contractStatus}</dd>
                  <dt>Auth</dt>
                  <dd className="text-right text-foreground">{cfg.auth.kind}</dd>
                  <dt>Sync strategy</dt>
                  <dd className="text-right text-foreground">{cfg.syncStrategy}</dd>
                  <dt>Rate limit</dt>
                  <dd className="text-right text-foreground">{cfg.rateLimitPerSecond}/s</dd>
                  <dt>Cache TTL</dt>
                  <dd className="text-right text-foreground">{cfg.cacheTtlSeconds}s</dd>
                  {h?.latencyMs != null && (
                    <>
                      <dt>Latency</dt>
                      <dd className="text-right text-foreground">{h.latencyMs}ms</dd>
                    </>
                  )}
                </dl>
                {h?.missingSecrets.length ? (
                  <p className="rounded-md bg-muted p-2 text-muted-foreground">
                    <ShieldCheck className="mr-1 inline h-3 w-3" /> Awaiting secrets:{" "}
                    {h.missingSecrets.join(", ")}
                  </p>
                ) : null}
                {h?.message ? <p className="text-muted-foreground">{h.message}</p> : null}
                {row ? (
                  <p className="rounded-md border border-border/60 p-2">
                    Last sync {row.received} records · {row.created} new · {row.updated} updated ·{" "}
                    {row.durationMs}ms
                    {row.fromCache ? " · cached" : ""}
                    {row.warnings.length ? ` · ${row.warnings.join("; ")}` : ""}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void doSync(cfg.id)}
                >
                  {busy === cfg.id ? "Syncing…" : "Sync catalogue"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <Clock className="mr-2 inline h-4 w-4" />
            Connector activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connector calls recorded on this worker instance yet.
            </p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {logs.map((l, i) => (
                <li key={`${l.at}-${i}`} className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground">
                    {new Date(l.at).toLocaleTimeString()}
                  </span>
                  <span className="font-semibold">{l.partnerId}</span>
                  <span>{l.operation}</span>
                  <span
                    className={l.status === "error" ? "text-destructive" : "text-muted-foreground"}
                  >
                    {l.status}
                  </span>
                  <span className="text-muted-foreground">{l.durationMs}ms</span>
                  {l.detail ? <span className="text-muted-foreground">{l.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
