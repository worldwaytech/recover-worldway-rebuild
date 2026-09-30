import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyTourBookings } from "@/lib/travelshop/tours.functions";
import { CUSTOMER_TOUR_STATUS_LABEL } from "@/lib/travelshop/reference";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";

export const Route = createFileRoute("/account/tours")({
  head: () => ({
    meta: [
      { title: "My tours — Worldway Travels Group" },
      { name: "description", content: "Your Worldway tour bookings, confirmations and receipts." },
      { property: "og:title", content: "My tours — Worldway Travels Group" },
      { property: "og:description", content: "Your Worldway tour bookings, confirmations and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tours,
});

function Tours() {
  const list = useServerFn(listMyTourBookings);
  const { data = [], isLoading } = useQuery({ queryKey: ["account", "tours"], queryFn: () => list() });
  return (
    <Panel title="Tours" description="Tour bookings made with Worldway Travels Group.">
      {isLoading ? <EmptyState title="Loading tours…" /> : data.length === 0 ? (
        <EmptyState title="No tour bookings yet" hint="Choose a tour and date in the tour marketplace to book." />
      ) : (
        <Rows>
          {data.map((b) => (
            <Row key={b.id}
              title={<Link to="/account/tour/$id" params={{ id: b.id }} className="text-primary underline-offset-4 hover:underline">{b.tour_name}</Link>}
              meta={`Ref ${b.reference} · ${fmtDate(b.tour_date)} · ${b.adults + b.children} travellers`}
              right={<div className="text-right"><div className="text-sm text-primary">{b.customer_currency} {Number(b.customer_total).toLocaleString()}</div><div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{CUSTOMER_TOUR_STATUS_LABEL[b.status]}</div></div>}
            />
          ))}
        </Rows>
      )}
    </Panel>
  );
}
