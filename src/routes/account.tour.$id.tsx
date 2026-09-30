import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTourBooking } from "@/lib/travelshop/tours.functions";
import { CUSTOMER_TOUR_STATUS_LABEL } from "@/lib/travelshop/reference";
import { Button } from "@/components/ui/button";
import { EmptyState, fmtDate } from "@/components/account/account-ui";

export const Route = createFileRoute("/account/tour/$id")({
  head: () => ({
    meta: [
      { title: "Tour confirmation & receipt — Worldway Travels Group" },
      { name: "description", content: "Your Worldway tour booking confirmation, payment receipt and invoice." },
      { property: "og:title", content: "Tour confirmation & receipt — Worldway Travels Group" },
      { property: "og:description", content: "Your Worldway tour booking confirmation, payment receipt and invoice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TourRecord,
});

function TourRecord() {
  const { id } = Route.useParams();
  const get = useServerFn(getMyTourBooking);
  const { data: b, isLoading } = useQuery({ queryKey: ["account", "tour", id], queryFn: () => get({ data: { id } }) });
  if (isLoading) return <EmptyState title="Loading booking…" />;
  if (!b) return <EmptyState title="Booking not found" hint="This booking isn't on your account." />;
  const confirmed = b.status === "confirmed";
  const paid = b.payments.filter((p) => p.status === "paid");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/account/tours" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">← My tours</Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Print / save as PDF</Button>
      </div>
      <article className="rounded-2xl border border-border/60 bg-card p-8 text-card-foreground">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <p className="font-display text-2xl text-primary">Worldway Travels Group</p>
            <p className="text-xs text-muted-foreground">worldwaytravelsgroup.com</p>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{confirmed ? "Booking confirmation & tax invoice" : "Booking record"}</p>
            <p className="text-lg">{b.reference}</p>
            <p className="text-xs uppercase tracking-widest text-primary">{CUSTOMER_TOUR_STATUS_LABEL[b.status]}</p>
          </div>
        </header>
        {!confirmed && <p className="mt-4 rounded-md border border-border/60 bg-muted/40 p-3 text-sm">This booking is not yet confirmed. The Worldway team is finalising it and will contact you. {b.status === "refunded" ? "Your payment has been refunded." : ""}</p>}
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Tour</dt><dd>{b.tourName}</dd></div>
          <div><dt className="text-muted-foreground">Date</dt><dd>{fmtDate(b.tourDate)}</dd></div>
          <div><dt className="text-muted-foreground">Service</dt><dd className="capitalize">{b.service}</dd></div>
          <div><dt className="text-muted-foreground">Travellers</dt><dd>{b.adults} adult{b.adults === 1 ? "" : "s"}{b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">Lead traveller</dt><dd>{b.lead.name}{b.lead.email ? ` · ${b.lead.email}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">Booked</dt><dd>{fmtDate(b.createdAt)}</dd></div>
        </dl>
        <section className="mt-8 border-t border-border/60 pt-6">
          <h2 className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Payment receipt</h2>
          {b.payments.length === 0 ? <p className="mt-2 text-sm">No payment recorded.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1 font-normal">Receipt</th><th className="font-normal">Date</th><th className="font-normal">Status</th><th className="text-right font-normal">Amount</th></tr></thead>
              <tbody>{b.payments.map((p) => (
                <tr key={p.receiptNo} className="border-t border-border/40"><td className="py-1">{p.receiptNo}</td><td>{fmtDate(p.paidAt)}</td><td className="capitalize">{p.status.replace(/_/g, " ")}</td><td className="text-right">{p.currency} {p.amount.toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          )}
          <div className="mt-4 flex justify-end gap-8 text-sm"><span className="text-muted-foreground">Tour total (all taxes and fees included)</span><span className="text-primary">{b.currency} {b.total.toFixed(2)}</span></div>
          {paid.length > 0 && <p className="mt-1 text-right text-xs text-muted-foreground">Paid in full</p>}
        </section>
        <footer className="mt-8 border-t border-border/60 pt-4 text-xs text-muted-foreground">Please quote {b.reference} in all correspondence with Worldway Travels Group.</footer>
      </article>
    </div>
  );
}
