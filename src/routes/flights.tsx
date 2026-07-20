import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "flights" as const;

export const Route = createFileRoute("/flights")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/flights";
    return {
      meta: [
        { title: "First & Business Class Flights | Worldway Luxe" },
        { name: "description", content: "First-class and business-class airfare with negotiated fares and mileage-boosting routings." },
        { property: "og:title", content: "First & Business Class Flights | Worldway Luxe" },
        { property: "og:description", content: "First-class and business-class airfare with negotiated fares and mileage-boosting routings." },
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
