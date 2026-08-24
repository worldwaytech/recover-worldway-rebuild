import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrystalConnectorStatus, runCrystalSync } from "@/lib/crystal/crystal.functions";
import {
  getCrystalBookingDiagnostics,
  getCrystalProdReadiness,
} from "@/lib/crystal/crystal-booking.functions";
import type { CrystalConnectorStatus } from "@/lib/crystal/connector.server";
import type { CrystalGateState, CrystalProdReadiness } from "@/lib/crystal/booking-contract";


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

type BookingDiagnostics = Awaited<ReturnType<typeof getCrystalBookingDiagnostics>>;

const GATE_VARIANT: Record<CrystalGateState, "default" | "secondary" | "destructive" | "outline"> = {
  green: "default",
  amber: "secondary",
  red: "destructive",
  unknown: "outline",
};

function ReadinessPanel({
  readiness,
  onProbe,
  busy,
}: {
  readiness: CrystalProdReadiness;
  onProbe: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Crystal PROD readiness check</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={readiness.readyForLive ? "default" : "destructive"}>
            {readiness.readyForLive ? "ALL GATES GREEN" : "NOT READY FOR LIVE"}
          </Badge>
          <Button variant="outline" size="sm" onClick={onProbe} disabled={busy}>
            {busy ? "Checking…" : "Run read-only PROD check"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Generated {readiness.generatedAt} · CRYSTAL_BOOKING_ENABLED ={" "}
          {String(readiness.bookingEnabledFlag)} · rail{" "}
          {readiness.railArmed ? "armed" : "fail-closed"} ·{" "}
          {readiness.probed ? "read-only PROD probe executed" : "no supplier call made"}
        </p>
        <ul className="space-y-2">
          {readiness.gates.map((g) => (
            <li key={g.id} className="flex flex-wrap items-start gap-2">
              <Badge variant={GATE_VARIANT[g.state]}>{g.state.toUpperCase()}</Badge>
              <span className="font-medium">{g.label}</span>
              <span className="text-muted-foreground">{g.detail}</span>
              {g.blocker ? (
                <span className="w-full text-xs text-destructive">Blocker: {g.blocker}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <div>
          <p className="text-muted-foreground">Remaining blockers before LIVE activation</p>
          {readiness.blockers.length === 0 ? (
            <p>
              None. Every gate is green — CRYSTAL_BOOKING_ENABLED=true may now be set to go LIVE.
            </p>
          ) : (
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {readiness.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CrystalConsole() {
  const fetchStatus = useServerFn(getCrystalConnectorStatus);
  const sync = useServerFn(runCrystalSync);
  const fetchBooking = useServerFn(getCrystalBookingDiagnostics);
  const fetchReadiness = useServerFn(getCrystalProdReadiness);
  const [status, setStatus] = useState<CrystalConnectorStatus | null>(null);
  const [booking, setBooking] = useState<BookingDiagnostics | null>(null);
  const [readiness, setReadiness] = useState<CrystalProdReadiness | null>(null);
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function runReadiness(probe: boolean) {
    setProbing(true);
    try {
      setReadiness((await fetchReadiness({ data: { probe } })) as CrystalProdReadiness);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Readiness check failed.");
    } finally {
      setProbing(false);
    }
  }

  async function refresh(health = false) {
    setLoading(true);
    try {
      setStatus((await fetchStatus({ data: { health } })) as CrystalConnectorStatus);
      setBooking(await fetchBooking());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load connector status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    void runReadiness(false);
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
                <p className="text-muted-foreground">Shopping API</p>
                <p>{status.shoppingApiStatus}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Booking API</p>
                <p>{status.bookingApiStatus}</p>
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

          {booking ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Booking rail</CardTitle>
                <Badge variant={booking.capability.live ? "default" : "secondary"}>
                  {booking.capability.live ? "ARMED" : "DISABLED"}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Shopping API</p>
                  <p>{booking.capability.shoppingApiStatus}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Booking API</p>
                  <p>{booking.capability.bookingApiStatus}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Configured operations</p>
                  <p>{booking.capability.operations.join(", ") || "None"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Channel context</p>
                  <p>
                    X-SalesChannel{" "}
                    {booking.capability.channel.salesChannelConfigured ? "set" : "missing"} ·
                    X-OfficeID{" "}
                    {booking.capability.channel.officeIdConfigured ? "set" : "missing"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Block reason</p>
                  <p>{booking.capability.reason ?? "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Detail</p>
                  <p>{booking.capability.detail}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">
                    Documented PROD operation map (AKTG Booking API spec)
                  </p>
                  <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                    {booking.catalog.map((op) => (
                      <li key={`${op.operation}-${op.method}`} className="flex items-center gap-2">
                        <Badge variant={op.configured ? "secondary" : "destructive"}>
                          {op.configured ? "mapped" : "unconfigured"}
                        </Badge>
                        <span>{op.operation}</span>
                        <span className="font-mono text-xs text-muted-foreground">{op.method}</span>
                        <span className="text-muted-foreground">
                          {op.required ? "required" : op.readOnly ? "read-only" : "optional"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Recent booking calls</p>
                  {booking.audit.length === 0 ? (
                    <p>No supplier booking calls have been made.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {booking.audit.map((a, i) => (
                        <li key={`${a.at}-${i}`} className="flex flex-wrap gap-2">
                          <span className="text-muted-foreground">{a.at}</span>
                          <Badge variant={a.ok ? "secondary" : "destructive"}>{a.operation}</Badge>
                          <span>
                            {a.status ?? "—"} · {a.attempts} attempt(s) · {a.durationMs}ms
                            {a.detail ? ` · ${a.detail}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
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
