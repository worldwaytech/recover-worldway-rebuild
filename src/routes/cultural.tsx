import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "cultural" as const;

export const Route = createFileRoute("/cultural")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/cultural";
    return {
      meta: [
        { title: "Cultural & Heritage Tours | Worldway Luxe" },
        { name: "description", content: "Private access to the world's living history in Rome, Kyoto, Rajasthan and Morocco." },
        { property: "og:title", content: "Cultural & Heritage Tours | Worldway Luxe" },
        { property: "og:description", content: "Private access to the world's living history in Rome, Kyoto, Rajasthan and Morocco." },
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
