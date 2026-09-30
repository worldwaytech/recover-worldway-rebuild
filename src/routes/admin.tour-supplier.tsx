import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkTourApiHealth, getTourSupplierOverview, runTourCatalogueSync, getTourBookingGates, staffSendTourToPartner, staffRefundTour } from "@/lib/travelshop/tours.functions";
import { PageHead, Panel, QueryState, Empty, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/tour-supplier")({
  head: adminHead("TravelShop tours", "Tour marketplace catalogue sync, failures and supplier bookings."),
  component: TourSupplierPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type O = { runs: any[]; failures: any[]; bookings: any[]; activeTours: number; storedTours: number; lastSuccessfulSync: string | null; bookingsEnabled: boolean; pricing: { markupPercent: number | null; source: string } };

function TourSupplierPage() {
  const q = useConsole<O>("tour-supplier", getTourSupplierOverview);
  const sync = useServerFn(runTourCatalogueSync);
  const [busy, setBusy] = useState(false);
  const health = useServerFn(checkTourApiHealth);
  const [h, setH] = useState<Awaited<ReturnType<typeof checkTourApiHealth>> | null>(null);
  const [checking, setChecking] = useState(false);
  const d = q.data;
  const gq = useConsole<Awaited<ReturnType<typeof getTourBookingGates>>>("tour-booking-gates", getTourBookingGates);
  const send = useServerFn(staffSendTourToPartner);
  const refund = useServerFn(staffRefundTour);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Tours & Activities" title="TravelShop Settings — Tour Marketplace" intro="Supplier for /marketplace. Bókun is disabled on the marketplace; its historical data is kept." />
      <QueryState q={q}>
        <div className="grid gap-4 sm:grid-cols-4">
          <Panel title="Active tours"><div className="text-2xl font-semibold">{d?.activeTours ?? 0}</div></Panel>
          <Panel title="Stored tours"><div className="text-2xl font-semibold">{d?.storedTours ?? 0}</div></Panel>
          <Panel title="Last successful sync"><div className="text-sm">{when(d?.lastSuccessfulSync)}</div></Panel>
          <Panel title="Supplier booking"><div className={`text-sm ${d?.bookingsEnabled ? "text-primary" : "text-destructive"}`}>{d?.bookingsEnabled ? "Enabled" : "Not authorised (TRAVELSHOP_BOOKING_ENABLED off)"}</div></Panel>
        </div>
        <Panel
          title="API status & inventory"
          right={<button disabled={checking} onClick={async () => { setChecking(true); try { setH(await health()); } finally { setChecking(false); } }} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">{checking ? "Checking…" : "Check API now"}</button>}
        >
          {!h ? <Empty>Run a live check to see API status and exact inventory counts.</Empty> : (
            <div className="space-y-2 text-sm">
              <p className={h.health.ok ? "text-primary" : "text-destructive"}>{h.health.ok ? `API reachable · ${h.health.ms} ms` : `API error: ${h.health.error}`} · checked {when(h.health.checkedAt)}</p>
              <div className="flex flex-wrap gap-4 text-xs">{Object.entries(h.counts).map(([k, v]) => <span key={k}><b>{v}</b> {k}</span>)}</div>
            </div>
          )}
        </Panel>
        <Panel title="Booking gates">
          <ol className="space-y-1 text-sm">
            {(gq.data?.gates ?? []).map((g) => (
              <li key={g.gate}><span className={g.open ? "text-primary" : "text-destructive"}>{g.open ? "OPEN" : "BLOCKED"}</span> · {g.gate} — <span className="text-muted-foreground">{g.detail}</span></li>
            ))}
          </ol>
          {gq.data ? <p className="mt-3 text-xs text-muted-foreground">Contract evidence: {gq.data.evidence.method}, {gq.data.evidence.verifiedAt}. Still unverified: {gq.data.unverified.join(" ")}</p> : null}
          {sendMsg ? <p className="mt-2 text-xs">{sendMsg}</p> : null}
          <p className="mt-2 text-xs"><a href="/admin/tour-payment" className="underline">Open staff tour payment</a></p>
        </Panel>
        <Panel title="Pricing">
          <p className="text-sm">{d?.pricing.markupPercent == null ? "No Worldway markup approved — customers pay the live retail price; margin = supplier commission." : `Worldway markup ${d.pricing.markupPercent}% on live retail price.`}</p>
        </Panel>
        <Panel
          title="Sync runs"
          right={
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); try { await sync(); } finally { setBusy(false); void q.refetch(); } }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Run / continue sync"}
            </button>
          }
        >
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground"><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Pages</th><th>Reported</th><th>Fetched</th><th>New</th><th>Updated</th><th>Same</th><th>Skipped</th><th>Failed</th><th>Dupes</th><th>Retired</th><th>Requests</th></tr></thead>
            <tbody>
              {(d?.runs ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="py-1">{when(r.started_at)}</td><td>{r.trigger}</td><td>{r.status}</td><td>{r.pages_done}/{r.pages_total ?? "?"}</td><td>{r.total_reported ?? "—"}</td>
                  <td>{r.fetched}</td><td>{r.created}</td><td>{r.updated}</td><td>{r.unchanged}</td><td>{r.skipped}</td><td>{r.failed}</td><td>{r.duplicates}</td><td>{r.deactivated}</td><td>{r.request_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Recent failures">
          {(d?.failures ?? []).length === 0 ? <Empty>No failures logged.</Empty> : (
            <ul className="space-y-1 text-xs">{d!.failures.map((f) => <li key={f.id}>{when(f.created_at)} · {f.kind} · page {f.page ?? "—"} · {f.slug ?? f.external_id ?? ""} · {f.error}</li>)}</ul>
          )}
        </Panel>
        <Panel title="Tour bookings">
          {(d?.bookings ?? []).length === 0 ? <Empty>No tour bookings yet.</Empty> : (
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground"><tr><th>Created</th><th>Tour</th><th>Date</th><th>Pax</th><th>Customer</th><th>Supplier retail</th><th>Status</th><th>Supplier ref</th><th></th></tr></thead>
              <tbody>{d!.bookings.map((b) => (
                <tr key={b.id} className="border-t border-border/40"><td className="py-1">{when(b.created_at)}</td><td>{b.tour_name}</td><td>{b.tour_date}</td><td>{b.adults}+{b.children}</td><td>{b.customer_currency} {b.customer_total}</td><td>{b.supplier_retail_total}</td><td>{b.status}</td><td>{b.supplier_reference_id ?? "—"}</td><td>{b.status === "awaiting_supplier_authorization" ? <button className="rounded-md border border-primary px-2 py-0.5 text-[11px] text-primary" onClick={async () => { if (!confirm("Send this paid booking to the partner? This creates a real booking.")) return; const r = await send({ data: { bookingId: b.id } }); setSendMsg(r.ok ? `Booked — reference ${r.reference}` : r.reason); void q.refetch(); void gq.refetch(); }}>Send to partner</button> : ["supplier_failed", "price_changed", "cancelled"].includes(b.status) ? <button className="rounded-md border border-destructive px-2 py-0.5 text-[11px] text-destructive" onClick={async () => { if (!confirm("Refund the customer's full payment for this booking?")) return; const r = await refund({ data: { bookingId: b.id } }); setSendMsg(r.ok ? "Refund issued" : r.reason); void q.refetch(); }}>Refund</button> : null}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      </QueryState>
    </div>
  );
}
