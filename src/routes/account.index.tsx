import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { accountApi } from "@/lib/account-data";
import { StatTile } from "@/components/portal-shell";
import { Panel, Rows, Row, EmptyState, fmtDate } from "@/components/account/account-ui";
import { useServerFn } from "@tanstack/react-start";
import { listMyAviationRequests } from "@/lib/aviation/private-aviation.functions";

const AV_STATUS: Record<string, string> = {
  submitted: "Received",
  sourcing: "Sourcing aircraft",
  options_sent: "Options ready",
  booked: "Booked",
  closed: "Closed",
  failed: "Desk follow-up",
};

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [
      { title: "Account overview — Worldway Travels Group" },
      { name: "description", content: "Your trips, bookings and saved journeys at a glance." },
      { property: "og:title", content: "Account overview — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Your trips, bookings and saved journeys at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const trips = useQuery({ queryKey: ["account", "trips"], queryFn: accountApi.trips });
  const bookings = useQuery({ queryKey: ["account", "bookings"], queryFn: accountApi.bookings });
  const saved = useQuery({ queryKey: ["account", "saved"], queryFn: accountApi.saved });
  const aviationFn = useServerFn(listMyAviationRequests);
  const aviation = useQuery({ queryKey: ["account", "aviation"], queryFn: () => aviationFn(), retry: false });

  const upcoming = (bookings.data ?? []).filter(
    (b) => b.travel_date && new Date(b.travel_date).getTime() >= Date.now(),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Trips"
          value={String(trips.data?.length ?? 0)}
          hint="Planned & completed"
        />
        <StatTile
          label="Upcoming bookings"
          value={String(upcoming.length)}
          hint="Confirmed departures"
        />
        <StatTile
          label="Saved"
          value={String(saved.data?.length ?? 0)}
          hint="Bookmarked journeys"
        />
      </div>

      <Panel
        title="Next departures"
        description="Bookings confirmed across flights, hotels, jets and ground."
        actions={
          <Link to="/account/bookings" className="text-xs uppercase tracking-widest text-primary">
            View all →
          </Link>
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming departures" hint="Bookings you make will appear here." />
        ) : (
          <Rows>
            {upcoming.slice(0, 5).map((b) => (
              <Row
                key={b.id}
                title={b.title}
                meta={`${b.product_type} · ${b.reference} · ${fmtDate(b.travel_date)}`}
                right={
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {b.status}
                  </span>
                }
              />
            ))}
          </Rows>
        )}
      </Panel>

      <Panel title="Private aviation requests" description="Charter and empty-leg requests with Worldway Private Aviation.">
        {(aviation.data?.items ?? []).length === 0 ? (
          <EmptyState title="No private aviation requests" hint="Charter and empty-leg requests you send will appear here." />
        ) : (
          <Rows>
            {(aviation.data?.items ?? []).slice(0, 10).map((r) => (
              <Row
                key={r.id}
                title={`${r.origin} → ${r.destination}`}
                meta={`${r.kind === "empty_leg" ? "Empty leg" : "Private jet charter"} · ${r.reference} · ${fmtDate(r.departure_date)} · ${r.passengers} pax`}
                right={
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {AV_STATUS[r.status] ?? r.status}
                  </span>
                }
              />
            ))}
          </Rows>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Plan a journey" description="Build a bespoke itinerary with our planner.">
          <Link
            to="/trip-builder"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Open Trip Builder →
          </Link>
        </Panel>
        <Panel title="Talk to the concierge" description="24/7 AI concierge across every product.">
          <Link to="/concierge" className="text-sm text-primary underline-offset-4 hover:underline">
            Open Concierge →
          </Link>
        </Panel>
      </div>
    </div>
  );
}
