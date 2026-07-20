import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "cruises-river" as const;

export const Route = createFileRoute("/cruises/river")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/cruises/river";
    return {
      meta: [
        { title: "River Cruises | Worldway Luxe" },
        { name: "description", content: "Boutique river cruising on the Danube, Douro, Mekong, Nile and beyond." },
        { property: "og:title", content: "River Cruises | Worldway Luxe" },
        { property: "og:description", content: "Boutique river cruising on the Danube, Douro, Mekong, Nile and beyond." },
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
