import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { airiqAdminIssueTicket, airiqAdminRetrieve, airiqAdminStatus } from "@/lib/airiq/airiq.functions";

export const Route = createFileRoute("/admin/airiq")({
  head: () => ({
    meta: [
      { title: "AIR iQ pre-purchased flights — Worldway Admin" },
      { name: "description", content: "AIR iQ connection health, pre-purchased flight bookings, ticketing and ticket retrieval." },
    ],
  }),
  component: AirIqAdmin,
});

type Status = Awaited<ReturnType<typeof airiqAdminStatus>>;

function AirIqAdmin() {
  const load = useServerFn(airiqAdminStatus);
  const issue = useServerFn(airiqAdminIssueTicket);
  const retrieve = useServerFn(airiqAdminRetrieve);
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setErr(null);
    load().then(setS).catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [load]);
  useEffect(refresh, [refresh]);
  const h = s?.health;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">AIR iQ — Pre-Purchased Flights</h1>
        <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <Card>
        <CardHeader><CardTitle>Health</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {h ? (
            <>
              <div className="flex gap-2">
                <Badge variant={h.ok ? "default" : "destructive"}>{h.ok ? "CONNECTED" : h.configured ? "ERROR" : "NOT CONNECTED"}</Badge>
                <Badge variant={h.bookingEnabled ? "default" : "outline"}>Ticketing {h.bookingEnabled ? "ENABLED" : "DISABLED"}</Badge>
              </div>
              <p>{h.detail} {h.ms ? `(${h.ms} ms)` : ""}</p>
              <p className="text-xs text-muted-foreground">Checked {s?.checkedAt}. Probe = login + sectors (read-only, never books).</p>
            </>
          ) : <p>Checking…</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Bookings</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!s?.bookings.length ? <p className="text-muted-foreground">No pre-purchased bookings yet.</p> : null}
          {s?.bookings.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2">
              <span>{b.reference} · {b.title} · {b.travel_date}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{b.status}</Badge>
                <Badge variant="outline">{b.supplier_status}</Badge>
                {b.supplier_reference ? <span className="font-mono text-xs">{b.supplier_reference}</span> : null}
                <span>₹{Number(b.amount).toLocaleString("en-IN")} (paid ₹{Number(b.amount_paid).toLocaleString("en-IN")})</span>
                {!b.supplier_reference && Number(b.amount_paid) >= Number(b.amount) ? (
                  <Button size="sm" onClick={async () => { const r = await issue({ data: { bookingId: b.id } }); setErr(r.ok ? null : r.error); refresh(); }}>Issue ticket</Button>
                ) : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ticket retrieval</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder="AIR iQ booking ID" value={ref} onChange={(e) => setRef(e.target.value)} />
            <Button onClick={async () => { const r = await retrieve({ data: { supplierReference: ref } }); setTicket(r.ok ? JSON.stringify(JSON.parse(r.ticket), null, 2) : r.error); }}>Retrieve</Button>
          </div>
          {ticket ? <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{ticket}</pre> : null}
          <p className="text-xs text-muted-foreground">AIR iQ documents no cancellation or refund endpoint — cancellations are raised with AIR iQ offline.</p>
        </CardContent>
      </Card>
    </div>
  );
}
