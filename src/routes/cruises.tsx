import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "cruises" as const;

export const Route = createFileRoute("/cruises")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/cruises";
    return {
      meta: [
        { title: "Luxury Cruises | Worldway Luxe" },
        { name: "description", content: "All-suite luxury cruises with Silversea, Regent, Seabourn and Ritz-Carlton Yacht Collection." },
        { property: "og:title", content: "Luxury Cruises | Worldway Luxe" },
        { property: "og:description", content: "All-suite luxury cruises with Silversea, Regent, Seabourn and Ritz-Carlton Yacht Collection." },
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
