import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "yachts" as const;

export const Route = createFileRoute("/yachts")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/yachts";
    return {
      meta: [
        { title: "Private Yacht Charters | Worldway Luxe" },
        { name: "description", content: "Motor and sailing yacht charters worldwide, with full crew, chef and toys." },
        { property: "og:title", content: "Private Yacht Charters | Worldway Luxe" },
        { property: "og:description", content: "Motor and sailing yacht charters worldwide, with full crew, chef and toys." },
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
