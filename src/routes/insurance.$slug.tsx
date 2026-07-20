import { createFileRoute, notFound } from "@tanstack/react-router";
import { CollectionDetail } from "@/components/CollectionTemplate";
import { getCollectionItem, collectionsMeta } from "@/lib/collections";

const KIND = "insurance" as const;

export const Route = createFileRoute("/insurance/$slug")({
  loader: ({ params }) => {
    const item = getCollectionItem(KIND, params.slug);
    if (!item) throw notFound();
    return { item };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Not found" }, { name: "robots", content: "noindex" }] };
    const item = loaderData.item;
    const url = `https://recover-worldway-rebuild.lovable.app/insurance/${params.slug}`;
    const meta = collectionsMeta[KIND];
    return {
      meta: [
        { title: `${item.title} | ${meta.title} | Worldway Luxe` },
        { name: "description", content: `${item.subtitle}. ${item.highlights.slice(0,3).join(". ")}.`.slice(0,155) },
        { property: "og:title", content: `${item.title} | Worldway Luxe` },
        { property: "og:description", content: item.subtitle },
        { property: "og:image", content: item.image },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: item.title,
          description: item.subtitle,
          image: item.image,
          brand: { "@type": "Brand", name: "Worldway Luxe" },
          offers: item.priceFrom ? {
            "@type": "Offer",
            price: item.priceFrom,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url,
          } : undefined,
        }),
      }],
    };
  },
  component: Page,
});

function Page() {
  const { item } = Route.useLoaderData();
  return <CollectionDetail kind={KIND} item={item} />;
}
