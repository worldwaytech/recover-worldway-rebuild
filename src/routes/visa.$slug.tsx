import { createFileRoute, notFound } from "@tanstack/react-router";
import { CollectionDetail } from "@/components/CollectionTemplate";
import { collectionsMeta } from "@/lib/collections";
import { getCatalogueProductBySlug } from "@/lib/catalogue-engine";

const KIND = "visa" as const;

export const Route = createFileRoute("/visa/$slug")({
  loader: ({ params }) => {
    const item = getCatalogueProductBySlug(KIND, params.slug);
    if (!item) throw notFound();
    return { item };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Unavailable — Worldway Travels Group" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const item = loaderData.item;
    const meta = collectionsMeta[KIND];
    const url = `https://worldwaytravelsgroup.com/visa/${params.slug}`;
    const description = `${item.subtitle}. ${item.highlights.slice(0, 3).join(". ")}.`.slice(
      0,
      155,
    );
    return {
      meta: [
        { title: `${item.title} — ${meta.title} — Worldway Travels Group` },
        { name: "description", content: description },
        { property: "og:title", content: `${item.title} — Worldway Travels Group` },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: item.title,
            description: item.subtitle,
            brand: { "@type": "Brand", name: "Worldway Travels Group" },
            offers: item.priceFrom
              ? {
                  "@type": "Offer",
                  price: item.priceFrom,
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  url,
                }
              : undefined,
          }),
        },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { item } = Route.useLoaderData();
  return <CollectionDetail kind={KIND} item={item} />;
}
