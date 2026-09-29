import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { TripjackServiceStatus, type TripjackStatus } from "@/components/tripjack/service-status";
import { getTripjackStatus } from "@/lib/tripjack/tripjack.functions";
import { TripsafeBooking } from "@/components/tripjack/tripsafe-booking";

export const Route = createFileRoute("/trip/tripsafeservices")({
  loader: async () => (await getTripjackStatus({ data: { suite: "tripsafe" } })) as TripjackStatus,
  head: () => ({
    meta: [
      { title: "TripSafe Services — Trip | Worldway Travels Group" },
      {
        name: "description",
        content:
          "TripSafe travel protection: search, review and book cover including student and AMT plans through Worldway's secure travel-protection service.",
      },
      { property: "og:title", content: "TripSafe Services — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Travel protection plans with live supplier quoting, booking, amendments and cancellation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TripSafeServicesPage,
});

function TripSafeServicesPage() {
  const status = Route.useLoaderData();
  return (
    <PageShell>
      <PageHero
        eyebrow="Trip · TripSafe Services"
        title="Protection for every itinerary."
        subtitle="Travel cover, student plans and AMT policies quoted and issued alongside your booking."
        image="https://images.unsplash.com/photo-1521790361543-f645cf042ec4?auto=format&fit=crop&w=2000&q=80"
      />
      <TripsafeBooking enabled={status.live} />
      <TripjackServiceStatus
        status={status}
        intro="TripSafe Services connects Worldway to our travel-protection partner over the same secure server-side UAT channel. Search, review, booking, policy retrieval, amendment and cancellation — including student and AMT products — are wired into the Worldway booking and order system."
      />
    </PageShell>
  );
}
