import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { TripjackServiceStatus, type TripjackStatus } from "@/components/tripjack/service-status";
import { getTripjackStatus } from "@/lib/tripjack/tripjack.functions";
import { CabBooking } from "@/components/tripjack/cab-booking";

export const Route = createFileRoute("/trip/cabservices")({
  loader: async () => (await getTripjackStatus({ data: { suite: "cabs" } })) as TripjackStatus,
  head: () => ({
    meta: [
      { title: "Cab Services — Trip | Worldway Travels Group" },
      {
        name: "description",
        content:
          "Chauffeured cab services: airport transfers, round trips, outstation and local journeys powered by Worldway.",
      },
      { property: "og:title", content: "Cab Services — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Airport transfers, round trips, outstation and local cab journeys with live supplier quoting and booking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CabServicesPage,
});

function CabServicesPage() {
  const status = Route.useLoaderData();
  return (
    <PageShell>
      <PageHero
        eyebrow="Trip · Cab Services"
        title="Chauffeured ground travel, on demand."
        subtitle="Airport transfers, round trips, outstation runs and hourly local hire."
        image="https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=2000&q=80"
      />
      <CabBooking enabled={status.live} />
      <TripjackServiceStatus
        status={status}
        intro="Cab Services connects Worldway to our ground-transport partner over a secure server-side UAT channel. Location search, airport transfer, round-trip, outstation and local quoting, booking, payment, tracking, amendment and cancellation are all wired into the Worldway booking and order system."
      />
    </PageShell>
  );
}
