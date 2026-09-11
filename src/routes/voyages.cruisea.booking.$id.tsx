import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { CruiseaBookingDetailView } from "@/components/cruisea/cruisea-bookings";

export const Route = createFileRoute("/voyages/cruisea/booking/$id")({
  head: () => ({
    meta: [
      { title: "Cruisea Booking Confirmation | Worldway Travels Group" },
      {
        name: "description",
        content:
          "Review your Cruisea voyage hold, confirm your cabin, check guest details and manage cancellation.",
      },
      { property: "og:title", content: "Cruisea Booking — Worldway" },
      {
        property: "og:description",
        content: "Confirm or cancel your held Cruisea cabin and review your voyage details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CruiseaBookingPage,
});

function CruiseaBookingPage() {
  const { id } = Route.useParams();
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-xs uppercase tracking-[0.3em] text-primary">Voyages · Cruisea</div>
        <h1 className="mt-3 font-serif text-4xl text-foreground">Your voyage</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reconfirm your held cabin, review guests and complete your Cruisea booking.
        </p>
        <div className="mt-10">
          <CruiseaBookingDetailView bookingId={id} />
        </div>
      </div>
    </PageShell>
  );
}
