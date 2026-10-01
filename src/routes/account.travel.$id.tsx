import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { myTravelBooking, requestTravelCancellation } from "@/lib/up17/booking.functions";
import { Panel, EmptyState, fmtDate } from "@/components/account/account-ui";
import { fmtMinor } from "@/components/up17/travel-checkout";

export const Route = createFileRoute("/account/travel/$id")({
  head: () => ({
    meta: [
      { title: "Booking details — Worldway Travels Group" },
      { name: "description", content: "Your Worldway booking confirmation and receipt." },
      { property: "og:title", content: "Booking details — Worldway Travels Group" },
      { property: "og:description", content: "Your Worldway booking confirmation and receipt." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TravelDetail,
});

function TravelDetail() {
  const { id } = Route.useParams();
  const get = useServerFn(myTravelBooking);
  const cancel = useServerFn(requestTravelCancellation);
  const q = useQuery({ queryKey: ["account", "travel", id], queryFn: () => get({ data: { id } }) });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const b = q.data;
  if (q.isLoading) return <EmptyState title="Loading booking…" />;
  if (!b) return <EmptyState title="Booking not found" />;
  const s = b.summary as Record<string, unknown>;
  const fields: [string, unknown][] = [
    ["Lead traveller", s["lead"]],
    ["Travellers / guests", s["guests"]],
    ["City", s["city"]],
    ["Check-in", s["checkIn"]],
    ["Check-out", s["checkOut"]],
    ["Departure", s["departure"]],
    ["Seats", Array.isArray(s["seats"]) ? (s["seats"] as string[]).join(", ") : null],
    ["Paid with", b.paymentMethod === "wallet" ? "Worldway Wallet" : b.paymentMethod === "razorpay" ? "Card / UPI" : null],
    ["Booked on", fmtDate(b.createdAt)],
  ];
  return (
    <div className="space-y-4">
      <Link to="/account/travel" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">← All bookings</Link>
      <Panel title={String(s["title"] ?? "Booking")} description={`Worldway reference ${b.reference}`}>
        <div className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{b.statusLabel}</span>
            <span className="font-serif text-2xl text-primary">{fmtMinor(b.amountMinor, b.currency)}</span>
          </div>
          {b.message ? <p className="rounded-md border border-border p-3">{b.message}</p> : null}
          <dl className="grid grid-cols-2 gap-2">
            {fields.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Issued by Worldway Travels Group.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>Print / save as PDF</Button>
            {b.canCancel ? (
              <Button size="sm" variant="destructive" disabled={busy} onClick={async () => {
                if (!confirm("Request cancellation? Refunds follow the hotel's cancellation rules.")) return;
                setBusy(true);
                const r = await cancel({ data: { id } });
                setMsg(r.ok ? "Cancellation requested." : r.error);
                setBusy(false);
                void q.refetch();
              }}>Request cancellation</Button>
            ) : null}
          </div>
          {msg ? <p className="text-xs">{msg}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
