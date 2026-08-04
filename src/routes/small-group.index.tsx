import { createFileRoute } from "@tanstack/react-router";
import { CollectionLanding } from "@/components/CollectionTemplate";
import { getCollection } from "@/lib/collections";

const KIND = "small-group" as const;

export const Route = createFileRoute("/small-group/")({
  loader: () => getCollection(KIND),
  head: () => {
    const meta = getCollection(KIND).meta;
    const url = "https://worldwaytravelsgroup.com/small-group";
    const description = meta.intro.slice(0, 155);
    return {
      meta: [
        { title: `${meta.title} — Worldway Travels Group` },
        { name: "description", content: description },
        { property: "og:title", content: `${meta.title} — Worldway Travels Group` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: Page,
});

function Page() {
  return <CollectionLanding kind={KIND} />;
}
