import { createFileRoute, notFound } from "@tanstack/react-router";
import { BrowseHubPage } from "@/components/tours/browse-hub";
import { hubBySlug } from "@/lib/browse-hubs";
import type { ToursSearchState } from "@/components/tours-catalogue";

const ORIGIN = "https://worldwaytravelsgroup.com";

export const Route = createFileRoute("/tours/browse/$hub")({
  validateSearch: (search: Record<string, unknown>): ToursSearchState => {
    const str = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
    const sort = str("sort");
    return {
      q: str("q"),
      country: str("country"),
      region: str("region"),
      duration: str("duration"),
      budget: str("budget"),
      month: str("month"),
      sort:
        sort === "NAME" || sort === "PRICE" || sort === "DEPARTURE"
          ? (sort as ToursSearchState["sort"])
          : undefined,
    };
  },
  loader: ({ params }) => {
    const hub = hubBySlug(params.hub);
    if (!hub) throw notFound();
    return { hub };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Collection unavailable — Worldway Travels Group" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const hub = loaderData.hub;
    const url = `${ORIGIN}/tours/browse/${params.hub}`;
    return {
      meta: [
        { title: hub.seoTitle },
        { name: "description", content: hub.seoDescription },
        { property: "og:title", content: hub.title },
        { property: "og:description", content: hub.seoDescription },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: hub.image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: hub.image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: hub.title,
                description: hub.seoDescription,
                url,
                primaryImageOfPage: hub.image,
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: ORIGIN },
                  { "@type": "ListItem", position: 2, name: "Tours", item: `${ORIGIN}/tours` },
                  {
                    "@type": "ListItem",
                    position: 3,
                    name: "Browse",
                    item: `${ORIGIN}/tours/browse`,
                  },
                  { "@type": "ListItem", position: 4, name: hub.title, item: url },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: hub.faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { hub } = Route.useLoaderData();
  const search = Route.useSearch();
  return <BrowseHubPage hub={hub} search={search} />;
}
