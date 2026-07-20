import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "hotels" as const;

export const Route = createFileRoute("/hotels")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/hotels";
    return {
      meta: [
        { title: "Luxury Hotels & Resorts | Worldway Luxe" },
        { name: "description", content: "Preferred rates and VIP amenities at Aman, Rosewood, Four Seasons, Belmond, Oberoi." },
        { property: "og:title", content: "Luxury Hotels & Resorts | Worldway Luxe" },
        { property: "og:description", content: "Preferred rates and VIP amenities at Aman, Rosewood, Four Seasons, Belmond, Oberoi." },
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
