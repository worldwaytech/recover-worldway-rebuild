import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "polar" as const;

export const Route = createFileRoute("/polar-expeditions")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/polar-expeditions";
    return {
      meta: [
        { title: "Polar Expeditions | Worldway Luxe" },
        { name: "description", content: "Antarctica, Arctic, Greenland and Svalbard aboard purpose-built expedition ships." },
        { property: "og:title", content: "Polar Expeditions | Worldway Luxe" },
        { property: "og:description", content: "Antarctica, Arctic, Greenland and Svalbard aboard purpose-built expedition ships." },
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
