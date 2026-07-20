import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "tailor-made" as const;

export const Route = createFileRoute("/tailor-made")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/tailor-made";
    return {
      meta: [
        { title: "Tailor-Made Journeys | Worldway Luxe" },
        { name: "description", content: "Bespoke private journeys crafted around you by a dedicated Worldway specialist." },
        { property: "og:title", content: "Tailor-Made Journeys | Worldway Luxe" },
        { property: "og:description", content: "Bespoke private journeys crafted around you by a dedicated Worldway specialist." },
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
