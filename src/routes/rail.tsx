import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "rail" as const;

export const Route = createFileRoute("/rail")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/rail";
    return {
      meta: [
        { title: "Luxury Rail Journeys | Worldway Luxe" },
        { name: "description", content: "Belmond, Rovos Rail, Rocky Mountaineer, Maharajas' Express and Seven Stars in Kyushu." },
        { property: "og:title", content: "Luxury Rail Journeys | Worldway Luxe" },
        { property: "og:description", content: "Belmond, Rovos Rail, Rocky Mountaineer, Maharajas' Express and Seven Stars in Kyushu." },
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
