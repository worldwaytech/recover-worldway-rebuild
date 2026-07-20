import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { allCollections, collectionItems, type CollectionItem, type CollectionKind } from "@/lib/collections";
import { regions } from "@/lib/data";
import { SectionHeading } from "@/components/site";
import { CollectionItemCard } from "@/components/CollectionTemplate";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search & Discovery | Worldway Luxe" },
      { name: "description", content: "Search the full Worldway Luxe portfolio — cruises, safaris, rail, hotels, villas, yachts and private jet journeys." },
    ],
    links: [{ rel: "canonical", href: "https://recover-worldway-rebuild.lovable.app/search" }],
  }),
  component: SearchPage,
});

interface Hit { item: CollectionItem; kind: CollectionKind; base: string; title: string }

function SearchPage() {
  const [q, setQ] = useState("");
  const all: Hit[] = useMemo(() => {
    return allCollections.flatMap((c) =>
      collectionItems[c.slug].map((item) => ({ item, kind: c.slug, base: c.detailBasePath, title: c.title })),
    );
  }, []);
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return all.slice(0, 24);
    return all.filter((h) =>
      [h.item.title, h.item.subtitle, h.item.location, h.title, ...(h.item.highlights ?? [])]
        .join(" ").toLowerCase().includes(term),
    ).slice(0, 60);
  }, [q, all]);

  return (
    <main className="pt-24">
      <section className="container-lux py-12">
        <SectionHeading eyebrow="Discovery" title="Search the portfolio" intro="Search across every collection — cruises, safaris, hotels, jets and more." />
        <div className="mt-8 relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try 'Antarctica', 'Aman', 'private jet'…"
            className="w-full rounded-sm border border-border bg-card py-3 pl-12 pr-4 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          {regions.map((r) => (
            <Link key={r.slug} to="/destinations/$slug" params={{ slug: r.slug }} className="rounded-full border border-border bg-card px-3 py-1.5 uppercase tracking-widest text-muted-foreground hover:text-gold">
              {r.name}
            </Link>
          ))}
        </div>
      </section>
      <section className="container-lux pb-16">
        <p className="text-sm text-muted-foreground">{results.length} results</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((h) => (
            <CollectionItemCard key={`${h.kind}-${h.item.slug}`} item={h.item} detailBase={h.base} />
          ))}
        </div>
      </section>
    </main>
  );
}
