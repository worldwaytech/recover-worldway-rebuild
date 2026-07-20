import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "activities" as const;

export const Route = createFileRoute("/activities")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/activities";
    return {
      meta: [
        { title: "Signature Activities | Worldway Luxe" },
        { name: "description", content: "Private dining in the Colosseum, tea with a geisha, balloons over the Serengeti." },
        { property: "og:title", content: "Signature Activities | Worldway Luxe" },
        { property: "og:description", content: "Private dining in the Colosseum, tea with a geisha, balloons over the Serengeti." },
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
