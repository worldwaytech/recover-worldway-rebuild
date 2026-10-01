import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { myTravelBookings } from "@/lib/up17/booking.functions";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";

export const Route = createFileRoute("/account/travel")({
  head: () => ({
    meta: [
      { title: "Flights, hotels & buses — Worldway Travels Group" },
      { name: "description", content: "Your Worldway flight, hotel and bus bookings with Worldway references." },
      { property: "og:title", content: "Flights, hotels & buses — Worldway Travels Group" },
      { property: "og:description", content: "Your Worldway flight, hotel and bus bookings with Worldway references." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TravelLayout,
});

function TravelLayout() {
  const match = useMatchRoute();
  if (match({ to: "/account/travel/$id" })) return <Outlet />;
  return <TravelList />;
}

const PRODUCT: Record<string, string> = { flight: "Flight", hotel: "Hotel", bus: "Bus" };

function TravelList() {
  const list = useServerFn(myTravelBookings);
  const { data = [], isLoading } = useQuery({ queryKey: ["account", "travel"], queryFn: () => list() });
  return (
    <Panel title="Flights, hotels & buses" description="Bookings made with Worldway Travels Group.">
      {isLoading ? <EmptyState title="Loading bookings…" /> : data.length === 0 ? (
        <EmptyState title="No bookings yet" hint="Search flights, hotels or buses to book." />
      ) : (
        <Rows>
          {data.map((b) => (
            <Row key={b.id}
              title={<Link to="/account/travel/$id" params={{ id: b.id }} className="text-primary underline-offset-4 hover:underline">{String(b.summary?.["title"] ?? PRODUCT[b.product])}</Link>}
              meta={`${PRODUCT[b.product]} · Ref ${b.reference} · ${fmtDate(b.createdAt)}`}
              right={<div className="text-right"><div className="text-sm text-primary">{b.currency} {(b.amountMinor / 100).toLocaleString()}</div><div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{b.statusLabel}</div></div>}
            />
          ))}
        </Rows>
      )}
    </Panel>
  );
}
