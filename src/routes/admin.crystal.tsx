import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrystalConnectorStatus, runCrystalSync } from "@/lib/crystal/crystal.functions";
import type { CrystalConnectorStatus } from "@/lib/crystal/connector.server";

export const Route = createFileRoute("/admin/crystal")({
  head: () => ({
    meta: [
      { title: "Crystal Cruises connector — Worldway Admin" },
      {
        name: "description",
        content:
          "Monitor the Crystal Cruises supplier connector: credentials, feed mapping, synchronisation and audit trail.",
      },
    ],
  }),
  component: CrystalConsole,
});

function CrystalConsole() {
  const fetchStatus = useServerFn(getCrystalConnectorStatus);
  const sync = useServerFn(runCrystalSync);
  const [status, setStatus] = useState<CrystalConnectorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh(health = false) {
    setLoading(true);
    try {
      setStatus((await fetchStatus({ data: { health } })) as CrystalConnectorStatus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load connector status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSync() {
    setBusy(true);
    try {
      const res = await sync({ data: { force: true } });
      if (!res.ran) toast.warning(res.reason ?? "Synchronisation is disabled.");
      else toast.success(`${res.accepted} licensed voyages ingested.`);
      await refresh(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synchronisation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Crystal Cruises connector</h1>
          <p className="text-sm text-muted-foreground">
            Inventory publishes only from an authorised Crystal distribution channel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
            Check health
          </Button>
          <Button onClick={onSync} disabled={busy || !status?.syncEnabled}>
            {busy ? "Syncing…" : "Run synchronisation"}
          </Button>
        </div>
      </div>

      {loading && !status ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {status ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{status.partnerName}</CardTitle>
              <div className="flex gap-2">
                <Badge variant={status.mode === "live" ? "default" : "secondary"}>
                  {status.mode}
                </Badge>
                <Badge variant="outline">{status.contractStatus}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Authentication</p>
                <p>{status.authKind}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Licensed voyages in cache</p>
                <p>{status.inventoryCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Credentials required</p>
                <p>{status.credentialsRequired.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Credentials missing</p>
                <p>{status.credentialsMissing.join(", ") || "None"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Capabilities</p>
                <p>{status.capabilities.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last synchronisation</p>
                <p>{status.lastSyncAt ?? "Never"}</p>
              </div>
              {status.health ? (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Health</p>
                  <p>{status.health.message}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {status.feed ? (
            <Card>
              <CardHeader>
                <CardTitle>Feed ingestion</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Format</p>
                  <p>{status.feed.format}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mapped fields</p>
                  <p>{status.feed.mappedFields}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Push endpoint</p>
                  <p>{status.feed.pushPath}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Signed push enabled</p>
                  <p>{status.feed.pushEnabled ? "Yes" : "No"}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              {status.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No connector activity recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {status.audit.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="flex flex-wrap gap-2">
                      <span className="text-muted-foreground">{a.at}</span>
                      <Badge variant={a.ok ? "secondary" : "destructive"}>{a.action}</Badge>
                      <span>{a.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
