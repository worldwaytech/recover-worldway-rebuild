import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { searchMerchantExperiences } from "@/lib/viator-merchant/merchant.functions";

export const Route = createFileRoute("/merchant/")({
  head: () => ({
    meta: [
      { title: "Merchant Experiences — Worldway Travels" },
      { name: "description", content: "Book experiences worldwide with instant confirmation, live pricing and mobile tickets." },
      { property: "og:title", content: "Merchant Experiences — Worldway Travels" },
      { property: "og:description", content: "Instant-confirmation experiences with live pricing and mobile tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MerchantPage,
});

function MerchantPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["merchant-search", submitted],
    queryFn: () => searchMerchantExperiences({ data: { query: submitted || "london" } }),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-foreground">Merchant Experiences</h1>
      <p className="mt-2 text-muted-foreground">
        Instant-confirmation tours and activities with live pricing and mobile tickets.
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
      {(isError || (data && !data.ok)) && (
        <p className="mt-10 text-muted-foreground">
          The catalogue is temporarily unavailable. Please try again.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data?.products.map((p) => (
          <Link
            key={p.productCode}
            to="/merchant/$code"
            params={{ code: p.productCode }}
            className="overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-lg"
          >
            {p.image ? (
              <img
                src={p.image}
                alt={p.title}
                className="h-44 w-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="h-44 w-full bg-muted" />
            )}
            <div className="p-4">
              <h2 className="line-clamp-2 font-medium text-foreground">{p.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.rating !== null ? `${p.rating.toFixed(1)} · ${p.reviewCount} reviews` : ""}
                {p.durationLabel ? ` · ${p.durationLabel}` : ""}
              </p>
              {p.price !== null && (
                <p className="mt-2 font-semibold text-foreground">
                  From {p.currency} {p.price.toFixed(2)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
      {data?.ok && data.products.length === 0 && !isLoading && (
        <p className="mt-10 text-muted-foreground">No experiences matched your search.</p>
      )}
    </main>
  );
}
