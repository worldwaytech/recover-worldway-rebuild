import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { searchMarketplaceTours } from "@/lib/bokun/bokun.functions";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/marketplace/")({
  head: () => ({
    meta: [
      { title: "Tours Marketplace — Worldway Travels" },
      { name: "description", content: "Browse handpicked tours, day trips and experiences worldwide with live availability and instant pricing." },
      { property: "og:title", content: "Tours Marketplace — Worldway Travels" },
      { property: "og:description", content: "Live tours and experiences with real-time availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["marketplace-tours", submitted],
    queryFn: () => searchMarketplaceTours({ data: { ...(submitted ? { query: submitted } : {}) } }),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-foreground">Tours Marketplace</h1>
      <p className="mt-2 text-muted-foreground">
        Live availability and instant pricing on tours and day experiences worldwide.
      </p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search destination or experience"
          className="w-full rounded-md border border-border bg-background px-4 py-2 text-foreground"
          maxLength={120}
        />
        <button type="submit" className="rounded-md bg-primary px-5 py-2 text-primary-foreground">
          Search
        </button>
      </form>

      {isLoading && <p className="mt-10 text-muted-foreground">Loading live catalogue…</p>}
      {isError && <p className="mt-10 text-muted-foreground">The catalogue is temporarily unavailable. Please try again.</p>}
      {data && "error" in data && data.error && (
        <p className="mt-10 text-muted-foreground">The catalogue is temporarily unavailable. Please try again.</p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((p) => (
          <Link
            key={p.id}
            to="/marketplace/$id"
            params={{ id: p.id }}
            className="overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-lg"
          >
            {p.coverPhoto ? (
              <img src={mediaUrl(p.coverPhoto)} alt={p.title} className="h-44 w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-44 w-full bg-muted" />
            )}
            <div className="p-4">
              <h2 className="line-clamp-2 font-medium text-foreground">{p.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[p.city, p.country].filter(Boolean).join(", ")}
                {p.durationText ? ` · ${p.durationText}` : ""}
              </p>
              {p.priceFrom !== undefined && (
                <p className="mt-2 font-semibold text-foreground">
                  From {p.currency ?? ""} {p.priceFrom.toFixed(2)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
      {data && data.items.length === 0 && !isLoading && (
        <p className="mt-10 text-muted-foreground">No experiences matched your search.</p>
      )}
    </main>
  );
}
