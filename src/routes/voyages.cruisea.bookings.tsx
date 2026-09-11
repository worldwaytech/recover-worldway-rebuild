import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { CruiseaBookingsList } from "@/components/cruisea/cruisea-bookings";

export const Route = createFileRoute("/voyages/cruisea/bookings")({
  head: () => ({
    meta: [
      { title: "My Cruisea Bookings | Worldway Travels Group" },
      {
        name: "description",
        content:
          "View, confirm and cancel your Cruisea cruise bookings, review cabins, guests and payment status.",
      },
      { property: "og:title", content: "My Cruisea Bookings — Worldway" },
      {
        property: "og:description",
        content: "Manage your held and confirmed Cruisea voyages in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CruiseaBookingsPage,
});

function CruiseaBookingsPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-xs uppercase tracking-[0.3em] text-primary">Voyages · Cruisea</div>
        <h1 className="mt-3 font-serif text-4xl text-foreground">My Cruisea bookings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Holds, confirmations and cancellations for every Cruisea voyage on your account.
        </p>
        <div className="mt-10">
          <CruiseaBookingsList />
        </div>
      </div>
    </PageShell>
  );
}
