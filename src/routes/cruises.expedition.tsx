import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "cruises-expedition" as const;

export const Route = createFileRoute("/cruises/expedition")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/cruises/expedition";
    return {
      meta: [
        { title: "Expedition Cruises | Worldway Luxe" },
        { name: "description", content: "Small-ship expeditions to Antarctica, the Arctic, Galápagos and the Kimberley." },
        { property: "og:title", content: "Expedition Cruises | Worldway Luxe" },
        { property: "og:description", content: "Small-ship expeditions to Antarctica, the Arctic, Galápagos and the Kimberley." },
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
