import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "aviation" as const;

export const Route = createFileRoute("/private-aviation")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/private-aviation";
    return {
      meta: [
        { title: "Private Aviation | Worldway Luxe" },
        { name: "description", content: "Private jet charter, jet card programmes and fully chartered private-jet expeditions." },
        { property: "og:title", content: "Private Aviation | Worldway Luxe" },
        { property: "og:description", content: "Private jet charter, jet card programmes and fully chartered private-jet expeditions." },
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
