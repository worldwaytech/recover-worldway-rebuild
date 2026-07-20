import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "wellness" as const;

export const Route = createFileRoute("/wellness")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/wellness";
    return {
      meta: [
        { title: "Wellness & Retreats | Worldway Luxe" },
        { name: "description", content: "Ayurvedic sanctuaries, alpine clinics and immersive wellness retreats worldwide." },
        { property: "og:title", content: "Wellness & Retreats | Worldway Luxe" },
        { property: "og:description", content: "Ayurvedic sanctuaries, alpine clinics and immersive wellness retreats worldwide." },
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
