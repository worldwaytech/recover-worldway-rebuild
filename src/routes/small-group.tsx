import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "small-group" as const;

export const Route = createFileRoute("/small-group")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/small-group";
    return {
      meta: [
        { title: "Small Group Journeys | Worldway Luxe" },
        { name: "description", content: "Intimate departures with fewer than 24 guests worldwide." },
        { property: "og:title", content: "Small Group Journeys | Worldway Luxe" },
        { property: "og:description", content: "Intimate departures with fewer than 24 guests worldwide." },
        { property: "og:image", content: meta.heroImage },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: meta.title,
          description: meta.intro,
          url,
        }),
      }],
    };
  },
  component: Page,
});

function Page() {
  return <CollectionLanding kind={KIND} items={collectionItems[KIND]} />;
}
