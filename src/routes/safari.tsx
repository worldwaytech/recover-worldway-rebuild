import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "safari" as const;

export const Route = createFileRoute("/safari")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/safari";
    return {
      meta: [
        { title: "Safari Experiences | Worldway Luxe" },
        { name: "description", content: "African safaris in the Serengeti, Okavango, Sabi Sand, South Luangwa and Rwanda." },
        { property: "og:title", content: "Safari Experiences | Worldway Luxe" },
        { property: "og:description", content: "African safaris in the Serengeti, Okavango, Sabi Sand, South Luangwa and Rwanda." },
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
