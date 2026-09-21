import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, ShieldCheck, ShieldAlert, Activity, Trash2 } from "lucide-react";
import {
  getHbxAdminOverview,
  invalidateHbxCache,
  probeHbxBookingReadiness,
  runHbxHotelCertification,
  runHbxSync,
} from "@/lib/hbx/hbx.functions";
import { ProductProvenanceTable } from "@/components/admin/ProductProvenanceTable";

type Suite = "hotels" | "activities" | "transfers";
type Overview = Awaited<ReturnType<typeof getHbxAdminOverview>>;
type Certification = Awaited<ReturnType<typeof runHbxHotelCertification>>;

export const Route = createFileRoute("/admin/hbx")({
  head: () => ({
    meta: [
      { title: "HBX connector console — Worldway Admin" },
      {
        name: "description",
        content:
          "Operate the HBX Group supplier integration: credentials, environment, API health, content synchronisation and cache.",
      },
    ],
  }),
  component: HbxConsole,
});

function HbxConsole() {
  const load = useServerFn(getHbxAdminOverview);
  const sync = useServerFn(runHbxSync);
  const clear = useServerFn(invalidateHbxCache);
  const probe = useServerFn(probeHbxBookingReadiness);
  const certify = useServerFn(runHbxHotelCertification);

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [cert, setCert] = useState<Certification | null>(null);

  async function onCertify() {
    setBusy("certify");
    setCert(null);
    try {
      const res = (await certify({ data: {} })) as Certification;
      setCert(res);
      toast[res.passed ? "success" : "warning"](
        res.passed
          ? `Hotel certification passed in ${res.environment} — booking ${res.bookingReference} created and cancelled.`
          : "Hotel certification finished with failures — see the step list.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Certification run failed.");
    } finally {
      setBusy(null);
    }
  }

  async function refresh(withProbe = false) {
    setLoading(true);
    try {
      setData((await load({ data: { probe: withProbe } })) as Overview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the HBX console.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSync(suite: Suite) {
    setBusy(`sync-${suite}`);
    try {
      const res = await sync({ data: { suite, maxPages: 2 } });
      toast[res.status === "completed" ? "success" : "warning"](
        `${suite}: ${res.status} — ${res.written} records written. ${res.message}`,
      );
      await refresh(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synchronisation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onProbe(suite: Suite) {
    setBusy(`probe-${suite}`);
    try {
      const res = await probe({ data: { suite } });
      toast[res.ok ? "success" : "warning"](`${suite} booking API: ${res.message}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Probe failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">HBX Group connector</h1>
          <p className="text-sm text-muted-foreground">
            Hotels, Experiences and Transfers · environment{" "}
            <span className="uppercase">{data?.environment ?? "—"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
            <Activity className="mr-2 h-4 w-4" /> Probe API health
          </Button>
          <Button variant="outline" onClick={() => void refresh(false)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await clear({ data: {} });
              toast.success(`Cleared ${res.cleared} cached responses.`);
              await refresh(false);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Clear cache
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {(data?.suites ?? []).map((s) => {
          const health = data?.health.find((h) => h.suite === s.suite);
          const syncRow = data?.sync.find((r) => r.suite === s.suite);
          return (
            <Card key={s.suite}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{s.label}</CardTitle>
                {health?.configured ? (
                  <Badge className="bg-emerald-600 text-primary-foreground">
                    <ShieldCheck className="mr-1 h-3 w-3" /> Credentials set
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <ShieldAlert className="mr-1 h-3 w-3" /> Awaiting credentials
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{s.summary}</p>
                <dl className="space-y-1 text-xs">
                  <Row label="Feature flag" value={`${s.featureFlag} · ${health?.enabled ? "on" : "off"}`} />
                  <Row label="Secrets" value={s.secrets.join(", ")} />
                  <Row label="Rate limit" value={`${s.rateLimitPerSecond}/s`} />
                  <Row label="Cache TTL" value={`${Math.round(s.cacheTtlSeconds / 60)} min`} />
                  <Row
                    label="Reachable"
                    value={
                      health?.reachable == null
                        ? "not probed"
                        : `${health.reachable ? "yes" : "no"} · HTTP ${health.status ?? "—"} · ${health.latencyMs ?? "—"}ms`
                    }
                  />
                  <Row label="Rows synced" value={String(syncRow?.rows ?? 0)} />
                  <Row label="Last sync" value={syncRow?.lastRunAt ?? "never"} />
                  <Row label="Last status" value={syncRow?.lastStatus ?? "—"} />
                  <Row label="Recent failures" value={String(syncRow?.recentFailures ?? 0)} />
                </dl>
                {health?.message ? (
                  <p className="text-xs text-muted-foreground">{health.message}</p>
                ) : null}
                {syncRow?.lastError ? (
                  <p className="text-xs text-destructive">{syncRow.lastError}</p>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => void onSync(s.suite as Suite)}
                    disabled={busy === `sync-${s.suite}` || !health?.configured}
                  >
                    {busy === `sync-${s.suite}` ? "Syncing…" : "Sync content"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onProbe(s.suite as Suite)}
                    disabled={busy === `probe-${s.suite}` || !health?.configured}
                  >
                    Booking readiness
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Hotel booking certification (test environment only)</CardTitle>
          <Button
            size="sm"
            onClick={() => void onCertify()}
            disabled={busy === "certify" || data?.environment !== "test"}
          >
            {busy === "certify" ? "Running…" : "Run certification cycle"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Connectivity → availability → CheckRate → test booking → booking detail → cancellation.
            The run is refused unless <code>HBX_ENVIRONMENT</code> is <code>test</code>, and the
            reservation it creates is cancelled inside the same run.
          </p>
          {cert ? (
            <div className="space-y-2">
              <p>
                <span className={cert.passed ? "text-emerald-600" : "text-destructive"}>
                  {cert.passed ? "PASSED" : "FAILED"}
                </span>{" "}
                · environment {cert.environment} · booking {cert.bookingReference ?? "—"} · final
                state {cert.finalBookingStatus ?? "—"}
              </p>
              <table className="w-full text-left">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-4">Step</th>
                    <th className="py-1 pr-4">Result</th>
                    <th className="py-1 pr-4">HTTP</th>
                    <th className="py-1">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {cert.steps.map((s) => (
                    <tr key={s.step} className="border-t border-border/50">
                      <td className="py-1 pr-4">{s.step}</td>
                      <td className={`py-1 pr-4 ${s.ok ? "text-emerald-600" : "text-destructive"}`}>
                        {s.ok ? "PASS" : "FAIL"}
                      </td>
                      <td className="py-1 pr-4">{s.status || "—"}</td>
                      <td className="py-1">{s.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Master flag <code>{data?.masterFlag}</code>. Required server secrets (names only — values
            never leave the server):
          </p>
          <p className="font-mono">{(data?.requiredSecrets ?? []).join(" · ")}</p>
          <p>
            Cached responses in memory: {data?.cache.entries ?? 0}. Set{" "}
            <code>HBX_ENVIRONMENT</code> to <code>test</code> or <code>live</code> to switch
            environments.
          </p>
          {data?.syncError ? <p className="text-destructive">{data.syncError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent supplier calls</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.log.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Suite</th>
                    <th className="py-2 pr-4">Operation</th>
                    <th className="py-2 pr-4">Outcome</th>
                    <th className="py-2 pr-4">HTTP</th>
                    <th className="py-2 pr-4">Attempts</th>
                    <th className="py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.log.map((entry) => (
                    <tr key={entry.requestId + entry.at} className="border-t border-border/50">
                      <td className="py-2 pr-4">{new Date(entry.at).toLocaleTimeString()}</td>
                      <td className="py-2 pr-4">{entry.suite}</td>
                      <td className="py-2 pr-4">{entry.operation}</td>
                      <td className="py-2 pr-4">{entry.outcome}</td>
                      <td className="py-2 pr-4">{entry.status ?? "—"}</td>
                      <td className="py-2 pr-4">{entry.attempts}</td>
                      <td className="py-2">{entry.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No supplier calls recorded yet.</p>
          )}
        </CardContent>
      </Card>
      <ProductProvenanceTable providerKey="hbx-hotels" title="HBX hotels provenance" />
      <ProductProvenanceTable providerKey="hbx-activities" title="HBX activities provenance" />
      <ProductProvenanceTable providerKey="hbx-transfers" title="HBX transfers provenance" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>

    </div>
  );
}
