import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "tours" as const;

export const Route = createFileRoute("/tours")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/tours";
    return {
      meta: [
        { title: "Ultra-Luxury Tours | Worldway Luxe" },
        { name: "description", content: "Hosted small-group and private tours by A&K, Tauck, Kensington and Butterfield & Robinson." },
        { property: "og:title", content: "Ultra-Luxury Tours | Worldway Luxe" },
        { property: "og:description", content: "Hosted small-group and private tours by A&K, Tauck, Kensington and Butterfield & Robinson." },
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
