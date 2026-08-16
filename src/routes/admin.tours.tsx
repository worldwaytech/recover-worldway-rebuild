import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, ShieldCheck, ShieldAlert, HelpCircle } from "lucide-react";
import { getToursWriteScope } from "@/lib/tours.functions";
import type { ToursWriteScopeReport } from "@/lib/tours.server";

export const Route = createFileRoute("/admin/tours")({
  head: () => ({
    meta: [
      { title: "Tours connector diagnostics — Worldway Admin" },
      {
        name: "description",
        content:
          "Diagnose the guided-tours supplier connector: credentials, environment and booking write permission.",
      },
    ],
  }),
  component: ToursDiagnostics,
});

type Payload = {
  scope: ToursWriteScopeReport;
  status: {
    configured: boolean;
    bookingConfigured: boolean;
    environment: string;
    missing: string[];
  };
};

function scopeBadge(scope: string) {
  if (scope === "BOOKING_ENABLED")
    return (
      <Badge className="bg-emerald-600 text-primary-foreground">
        <ShieldCheck className="mr-1 h-3 w-3" /> BOOKING_ENABLED
      </Badge>
    );
  if (scope === "READ_ONLY")
    return (
      <Badge variant="destructive">
        <ShieldAlert className="mr-1 h-3 w-3" /> READ_ONLY
      </Badge>
    );
  return (
    <Badge variant="outline">
      <HelpCircle className="mr-1 h-3 w-3" /> UNKNOWN
    </Badge>
  );
}

function ToursDiagnostics() {
  const probe = useServerFn(getToursWriteScope);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh(force = false) {
    setLoading(true);
    try {
      setData((await probe({ data: { force } })) as Payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run diagnostics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scope = data?.scope;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Tours connector diagnostics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live availability and pricing are read-only operations and always active. This panel
            reports whether the supplier has enabled booking (write) permission on the application
            key. The probe never creates a booking.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Re-probe
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking write permission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              {scopeBadge(scope?.scope ?? "UNKNOWN")}
              <span className="text-muted-foreground">
                {scope?.cached ? "cached result" : "live probe"}
              </span>
            </div>
            <p className="text-muted-foreground">{scope?.detail ?? "Running diagnostics…"}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">HTTP status</dt>
              <dd>{scope?.status ?? "—"}</dd>
              <dt className="text-muted-foreground">Checked at</dt>
              <dd>{scope?.checkedAt ? new Date(scope.checkedAt).toLocaleString() : "—"}</dd>
              <dt className="text-muted-foreground">Live booking flow</dt>
              <dd>{scope?.bookingFlowReady ? "Active" : "Desk-assisted fallback"}</dd>
            </dl>
            {scope?.scope === "READ_ONLY" ? (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                The supplier key is read-only. Travellers see a desk-assistance message, no booking
                is created and nothing is charged; every request is captured as a quote request. The
                moment the supplier enables booking scope, this panel flips to BOOKING_ENABLED and
                live reservations resume automatically with no code change.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connector configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">Environment</dt>
              <dd>{data?.status.environment ?? "—"}</dd>
              <dt className="text-muted-foreground">API key</dt>
              <dd>{data?.status.configured ? "Configured" : "Missing"}</dd>
              <dt className="text-muted-foreground">Agency code</dt>
              <dd>{scope?.agencyConfigured ? "Configured" : "Missing"}</dd>
              <dt className="text-muted-foreground">Booking credentials</dt>
              <dd>{data?.status.bookingConfigured ? "Complete" : "Incomplete"}</dd>
            </dl>
            {data?.status.missing.length ? (
              <p className="text-xs text-destructive">
                Missing secrets: {data.status.missing.join(", ")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">All supplier secrets present.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
