import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "family" as const;

export const Route = createFileRoute("/family")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/family";
    return {
      meta: [
        { title: "Family Luxury Travel | Worldway Luxe" },
        { name: "description", content: "Multi-generational family journeys engineered for every age." },
        { property: "og:title", content: "Family Luxury Travel | Worldway Luxe" },
        { property: "og:description", content: "Multi-generational family journeys engineered for every age." },
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
