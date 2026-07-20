import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { collectionItems, collectionsMeta } from "@/lib/collections";

const KIND = "transfers" as const;

export const Route = createFileRoute("/transfers")({
  head: () => {
    const meta = collectionsMeta[KIND];
    const url = "https://recover-worldway-rebuild.lovable.app/transfers";
    return {
      meta: [
        { title: "Private Transfers | Worldway Luxe" },
        { name: "description", content: "Chauffeured Mercedes S-Class, helicopters, seaplanes and private-jet transfers." },
        { property: "og:title", content: "Private Transfers | Worldway Luxe" },
        { property: "og:description", content: "Chauffeured Mercedes S-Class, helicopters, seaplanes and private-jet transfers." },
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
