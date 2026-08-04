import { createFileRoute } from "@tanstack/react-router";
import { BrowseIndexPage } from "@/components/tours/browse-hub";
import { BROWSE_HUBS } from "@/lib/browse-hubs";

const url = "https://worldwaytravelsgroup.com/tours/browse";
const description =
  "Browse guided journeys by collection: luxury, small group, private, safari, polar, rail, cruise, wellness, food and wine, wildlife and more — all live licensed inventory.";

export const Route = createFileRoute("/tours/browse/")({
  head: () => ({
    meta: [
      { title: "Browse Journeys by Collection — Worldway Travels Group" },
      { name: "description", content: description },
      { property: "og:title", content: "Browse Journeys by Collection" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Browse Journeys by Collection",
          description,
          url,
          hasPart: BROWSE_HUBS.map((h) => ({
            "@type": "CollectionPage",
            name: h.title,
            url: `${url}/${h.slug}`,
          })),
        }),
      },
    ],
  }),
  component: BrowseIndexPage,
});
