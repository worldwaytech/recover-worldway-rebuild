import { createFileRoute, Link } from "@tanstack/react-router";
import { PRODUCT_REGISTRY } from "@/lib/wwl.functions";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "All Products — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Every Worldway product: flights, hotels, activities, transfers, buses, private jets, trip planning, concierge, cruises, rail, car rental, villas, yachts, visa, and insurance.",
      },
      { property: "og:title", content: "All Products — Worldway Travels Group" },
      {
        property: "og:description",
        content: "The full Worldway product catalogue — live and upcoming.",
      },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const grouped = PRODUCT_REGISTRY.reduce<Record<string, (typeof PRODUCT_REGISTRY)[number][]>>(
    (acc, p) => {
      (acc[p.category] ||= []).push(p);
      return acc;
    },
    {},
  );
  const live = PRODUCT_REGISTRY.filter((p) => p.status === "live").length;
  const dormant = PRODUCT_REGISTRY.filter((p) => p.status === "dormant").length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-10">
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Catalogue</div>
        <h1 className="mt-2 font-serif text-4xl text-primary">All Products</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {PRODUCT_REGISTRY.length} products · {live} live · {dormant} awaiting partner API
          confirmation
        </p>
      </div>
      <div className="space-y-10">
        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-4 text-xs uppercase tracking-[0.3em] text-muted-foreground">{cat}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => {
                const inner = (
                  <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-primary/60">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-lg text-primary">{p.label}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.25em] ${
                          p.status === "live"
                            ? "border-primary/40 text-primary"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        {p.status === "live" ? "Live" : "Coming soon"}
                      </span>
                    </div>
                    {p.note ? <p className="mt-2 text-xs text-muted-foreground">{p.note}</p> : null}
                  </div>
                );
                return p.status === "live" && p.route ? (
                  <Link key={p.key} to={p.route} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div key={p.key}>{inner}</div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
