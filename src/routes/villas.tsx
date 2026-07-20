import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "villas" as const;

export const Route = createFileRoute("/villas")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/villas";
    return {
      meta: [
        { title: "Private Villas & Estates | Worldway Luxe" },
        { name: "description", content: "Fully staffed private villas and historic estates worldwide." },
        { property: "og:title", content: "Private Villas & Estates | Worldway Luxe" },
        { property: "og:description", content: "Fully staffed private villas and historic estates worldwide." },
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
