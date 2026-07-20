import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "insurance" as const;

export const Route = createFileRoute("/insurance")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/insurance";
    return {
      meta: [
        { title: "Travel Insurance | Worldway Luxe" },
        { name: "description", content: "Comprehensive travel-protection plans for luxury and adventure travellers." },
        { property: "og:title", content: "Travel Insurance | Worldway Luxe" },
        { property: "og:description", content: "Comprehensive travel-protection plans for luxury and adventure travellers." },
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
