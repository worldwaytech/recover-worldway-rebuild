import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { ActivityExplorer } from "@/components/activities/activity-explorer";

export const Route = createFileRoute("/activities/")({
  head: () => ({
    meta: [
      { title: "Activities & Experiences — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Search 400,000+ tours, tastings, private guides and access-only experiences worldwide — filter by destination, budget and duration, and book with Worldway.",
      },
      { property: "og:title", content: "Activities & Experiences — Worldway Travels Group" },
      {
        property: "og:description",
        content:
          "Enterprise search, live availability and instant booking across the global experiences catalogue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivitiesPage,
});

function ActivitiesPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Activities"
        title="Access, arranged in advance."
        subtitle="Private after-hours museums, chef tables, heli-skiing, and beyond."
        image="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2000&q=80"
      />
      <ActivityExplorer />
    </PageShell>
  );
}
