import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "honeymoon" as const;

export const Route = createFileRoute("/honeymoon")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/honeymoon";
    return {
      meta: [
        { title: "Honeymoon & Celebrations | Worldway Luxe" },
        { name: "description", content: "Overwater villas, private-island charters and grand-anniversary journeys." },
        { property: "og:title", content: "Honeymoon & Celebrations | Worldway Luxe" },
        { property: "og:description", content: "Overwater villas, private-island charters and grand-anniversary journeys." },
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
