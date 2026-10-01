import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { staffResolveTravelBooking, staffTravelBookings } from "@/lib/up17/booking.functions";
import { PageHead, Panel, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/travel-bookings")({
  head: adminHead("Flight, hotel & bus bookings", "Staff queue for UP17 flight, hotel and bus bookings, unclear results, wallet holds and refunds."),
  component: TravelBookingsAdmin,
});

type Row = {
  id: string; reference: string; product: string; status: string; currency: string; amount_minor: number;
  payment_method: string | null; payment_id: string | null; supplier_booking_id: string | null; supplier_pnr: string | null;
  supplier_response: unknown; summary: Record<string, unknown>; created_at: string;
};

function TravelBookingsAdmin() {
  const list = useServerFn(staffTravelBookings);
  const resolve = useServerFn(staffResolveTravelBooking);
  const q = useQuery({ queryKey: ["admin", "travel-bookings"], queryFn: () => list() });
  const [msg, setMsg] = useState<string | null>(null);
  const rows = (q.data ?? []) as Row[];

  async function act(id: string, action: "release_wallet" | "refund_wallet" | "mark_confirmed" | "mark_failed") {
    let supplierReference: string | undefined;
    if (action === "mark_confirmed") {
      supplierReference = prompt("UP17 confirmed booking reference / PNR (checked with UP17):") ?? undefined;
      if (!supplierReference) return;
    } else if (!confirm(`Confirm: ${action.replace("_", " ")}?`)) return;
    const r = await resolve({ data: { bookingId: id, action, supplierReference } });
    setMsg("ok" in r && r.ok ? "Done." : (r as { error?: string }).error ?? "Failed");
    void q.refetch();
  }

  return (
    <div className="space-y-6">
      <PageHead eyebrow="UP17" title="Flight, hotel & bus bookings" intro="Unclear results are never retried automatically. Check with UP17, then confirm or close. Card refunds for refused bookings are made in Razorpay; wallet holds are released automatically on refusal." />
      {msg ? <p className="text-sm">{msg}</p> : null}
      <Panel title={`Bookings (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="p-2">Ref</th><th>Product</th><th>Status</th><th>Amount</th><th>Paid by</th><th>UP17 booking / PNR</th><th>Created</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-2 font-mono">{r.reference}</td>
                  <td>{r.product}<div className="text-muted-foreground">{String(r.summary?.["title"] ?? "")}</div></td>
                  <td>{r.status}</td>
                  <td>{r.currency} {(Number(r.amount_minor) / 100).toFixed(2)}</td>
                  <td>{r.payment_method}{r.payment_id ? <div className="font-mono text-muted-foreground">{r.payment_id}</div> : null}</td>
                  <td className="font-mono">{r.supplier_booking_id ?? "—"} / {r.supplier_pnr ?? "—"}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    {r.status === "supplier_uncertain" ? (
                      <>
                        <button className="underline" onClick={() => act(r.id, "mark_confirmed")}>Confirm</button>
                        <button className="underline" onClick={() => act(r.id, "mark_failed")}>Not booked</button>
                      </>
                    ) : null}
                    {(r.status === "supplier_failed" && r.payment_method === "razorpay") || r.status === "cancelled" ? (
                      <button className="underline" onClick={() => act(r.id, "refund_wallet")}>Refund to wallet</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
