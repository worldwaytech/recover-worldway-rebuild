import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMarketplaceAvailability, getMarketplaceProduct } from "@/lib/bokun/bokun.functions";

export const Route = createFileRoute("/marketplace/$id")({
  head: () => ({
    meta: [
      { title: "Experience details — Worldway Travels" },
      { name: "description", content: "Live availability, pricing and details for this experience." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplaceDetailPage,
});

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function MarketplaceDetailPage() {
  const { id } = Route.useParams();
  const { data: product, isLoading } = useQuery({
    queryKey: ["marketplace-product", id],
    queryFn: () => getMarketplaceProduct({ data: { id } }),
  });
  const range = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 86400000);
    return { start: fmt(start), end: fmt(end) };
  }, []);
  const { data: availability } = useQuery({
    queryKey: ["marketplace-availability", id],
    queryFn: () => getMarketplaceAvailability({ data: { id, ...range } }),
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <main className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">Loading…</main>;
  if (!product) return <main className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">Experience not found.</main>;

  const s = product.summary;
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {s.coverPhoto && <img src={s.coverPhoto} alt={s.title} className="h-72 w-full rounded-xl object-cover" />}
      <h1 className="mt-6 text-3xl font-semibold text-foreground">{s.title}</h1>
      <p className="mt-1 text-muted-foreground">
        {[s.city, s.country].filter(Boolean).join(", ")}
        {s.durationText ? ` · ${s.durationText}` : ""}
      </p>
      {product.description && (
        <p className="mt-4 whitespace-pre-line text-foreground">{product.description.slice(0, 4000)}</p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-foreground">Live availability — next 30 days</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(availability ?? []).filter((a) => a.available).slice(0, 30).map((a) => (
            <button
              key={`${a.date}-${a.startTimeId ?? "x"}`}
              onClick={() => setSelected(a.date)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                selected === a.date
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {a.date}
              {a.startTime ? ` · ${a.startTime}` : ""}
            </button>
          ))}
          {availability && availability.filter((a) => a.available).length === 0 && (
            <p className="text-muted-foreground">No open departures in the next 30 days. Contact us and we'll arrange it.</p>
          )}
        </div>
        {selected && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            {(availability ?? [])
              .filter((a) => a.date === selected)
              .flatMap((a) => a.pricesByCategory ?? [])
              .map((p, i) => (
                <p key={i} className="text-foreground">
                  {p.category ?? "Traveller"}: {p.currency} {p.amount.toFixed(2)}
                </p>
              ))}
            <p className="mt-3 text-sm text-muted-foreground">
              Online booking for this marketplace opens once our supplier agreement is finalised. Contact our team to
              reserve this date — we hold live availability.
            </p>
            <a href="/contact" className="mt-3 inline-block rounded-md bg-primary px-5 py-2 text-primary-foreground">
              Enquire for {selected}
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
