import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { getTtcAdminOverview, probeTtcApiAccess, runTtcContentSync } from "@/lib/ttc/ttc.functions";
import { TTC_BRANDS, TTC_BRAND_ORDER } from "@/lib/ttc/config";
import { ProductProvenanceTable } from "@/components/admin/ProductProvenanceTable";

type Overview = Awaited<ReturnType<typeof getTtcAdminOverview>>;

export const Route = createFileRoute("/admin/ttc")({
  head: () => ({
    meta: [
      { title: "TTC connector console — Worldway Admin" },
      {
        name: "description",
        content:
          "Monitor the TTC catalogue: brand coverage, content synchronisation runs, API entitlement and live booking readiness.",
      },
    ],
  }),
  component: TtcConsole,
});

function TtcConsole() {
  const load = useServerFn(getTtcAdminOverview);
  const sync = useServerFn(runTtcContentSync);
  const probe = useServerFn(probeTtcApiAccess);

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setData((await load({ data: { probe: false } })) as Overview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the TTC console.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSync(brand: string) {
    setBusy(`sync-${brand}`);
    try {
      const outcome = (await sync({ data: { brand, limit: 50 } })) as Awaited<
        ReturnType<typeof runTtcContentSync>
      >;
      toast.success(
        `${brand}: ${outcome.imported} imported, ${outcome.updated} updated, ${outcome.unchanged} unchanged, ${outcome.failed} failed.`,
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The TTC sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onProbe() {
    setBusy("probe");
    try {
      const result = (await probe()) as Awaited<ReturnType<typeof probeTtcApiAccess>>;
      if (result.ok) toast.success("TTC API reachable and authorised.");
      else toast.error(result.detail);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The TTC API probe failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Supplier console</p>
          <h1 className="text-2xl font-semibold">The Travel Corporation (TTC)</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={() => void onProbe()} disabled={busy === "probe"}>
            <Activity className="mr-2 h-4 w-4" /> Probe API
          </Button>
        </div>
      </header>

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Catalogue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{data.total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">tours stored across TTC brands</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Live API entitlement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  {data.api.enabled ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                  )}
                  {data.api.enabled ? "Enabled" : "Disabled (fail-closed)"}
                </p>
                <p className="text-xs text-muted-foreground">Auth mode: {data.api.authMode}</p>
                {data.api.missing.length ? (
                  <p className="text-xs text-muted-foreground">
                    Pending: {data.api.missing.join(", ")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Booking: {data.api.bookingEnabled ? "enabled" : "disabled"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Content source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Firecrawl:{" "}
                  <Badge variant={data.contentSource.firecrawlConnected ? "default" : "destructive"}>
                    {data.contentSource.firecrawlConnected ? "connected" : "not connected"}
                  </Badge>
                </p>
                {data.rateLimit ? (
                  <p className="text-xs text-muted-foreground">
                    TTC rate limit remaining: {data.rateLimit.remaining ?? "—"} /{" "}
                    {data.rateLimit.limit ?? "—"}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brand coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {TTC_BRAND_ORDER.map((brand) => {
                const stats = data.brands.find((entry) => entry.brand === brand);
                return (
                  <div
                    key={brand}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{TTC_BRANDS[brand].label}</p>
                      <p className="text-xs text-muted-foreground">
                        {stats ? `${stats.count} tours · ${stats.withPrice} with pricing` : "not imported yet"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void onSync(brand)}
                      disabled={busy === `sync-${brand}`}
                    >
                      {busy === `sync-${brand}` ? "Syncing…" : "Sync 50"}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent synchronisation runs</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <th className="py-2">Started</th>
                    <th className="py-2">Brand</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Found</th>
                    <th className="py-2">New</th>
                    <th className="py-2">Updated</th>
                    <th className="py-2">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="py-2">{new Date(run.started_at).toLocaleString()}</td>
                      <td className="py-2">{run.brand}</td>
                      <td className="py-2">{run.status}</td>
                      <td className="py-2">{run.discovered}</td>
                      <td className="py-2">{run.imported}</td>
                      <td className="py-2">{run.updated}</td>
                      <td className="py-2">{run.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading the TTC console…</p>
      )}
      <ProductProvenanceTable providerKey="ttc" title="TTC product provenance" />
    </div>
  );
}
