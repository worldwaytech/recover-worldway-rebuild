import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "visa" as const;

export const Route = createFileRoute("/visa")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/visa";
    return {
      meta: [
        { title: "Visa Services | Worldway Luxe" },
        { name: "description", content: "End-to-end visa applications, expedited processing and courier logistics." },
        { property: "og:title", content: "Visa Services | Worldway Luxe" },
        { property: "og:description", content: "End-to-end visa applications, expedited processing and courier logistics." },
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
