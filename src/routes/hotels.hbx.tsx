import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageShell, PageHero, SearchCard, Field } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { searchHbxCatalogue } from "@/lib/hbx/hbx.functions";
import type { HbxCatalogueResult } from "@/lib/hbx/catalogue.server";

type Suite = "hotels" | "activities" | "transfers";

const SECTIONS: { id: Suite; label: string; blurb: string }[] = [
  {
    id: "hotels",
    label: "Hotels",
    blurb: "Live hotel inventory with full content, facilities and imagery.",
  },
  {
    id: "activities",
    label: "Experiences",
    blurb: "Curated experiences and activities from our live activities catalogue.",
  },
  {
    id: "transfers",
    label: "Transfers",
    blurb: "Private and shared transfer routes between terminals, hotels and zones.",
  },
];

export const Route = createFileRoute("/hotels/hbx")({
  head: () => ({
    meta: [
      { title: "Live Hotels — Hotels, Experiences & Transfers | Worldway" },
      {
        name: "description",
        content:
          "Search the Worldway Travels Group live collection: hotels, experiences and private transfers, curated for your journey.",
      },
      { property: "og:title", content: "Live Hotels — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Hotels, experiences and transfers from the Worldway live portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HbxPage,
});

function HbxPage() {
  const search = useServerFn(searchHbxCatalogue);
  const [suite, setSuite] = useState<Suite>("hotels");
  const [q, setQ] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  const [minStars, setMinStars] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HbxCatalogueResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (nextSuite: Suite, nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = (await search({
          data: {
            suite: nextSuite,
            page: nextPage,
            pageSize: 24,
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(countryCode.trim() ? { countryCode: countryCode.trim() } : {}),
            ...(destinationCode.trim() ? { destinationCode: destinationCode.trim() } : {}),
            ...(nextSuite === "hotels" && minStars ? { minStars } : {}),
          },
        })) as HbxCatalogueResult;
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The live hotel catalogue could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [search, q, countryCode, destinationCode, minStars],
  );

  useEffect(() => {
    void run(suite, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suite]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    void run(suite, 1);
  }

  const section = SECTIONS.find((s) => s.id === suite)!;

  return (
    <PageShell>
      <PageHero
        eyebrow="Worldway Live Collection"
        title="Hotels, experiences and transfers — live, in one place."
        subtitle="Live inventory, normalised into the Worldway catalogue for a seamless booking experience."
        image="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2000&q=80"
      />

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSuite(s.id);
              setPage(1);
            }}
            className={`rounded-full border px-6 py-2 text-[0.7rem] uppercase tracking-[0.3em] transition-colors ${
              suite === s.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <SearchCard title={`${section.label} — Live`}>
        <p className="mb-5 text-sm text-muted-foreground">{section.blurb}</p>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Keyword">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name contains…"
                className={inputClass}
              />
            </Field>
            <Field label="Country code">
              <input
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="ES, AE, GB…"
                className={inputClass}
              />
            </Field>
            <Field label="Destination code">
              <input
                value={destinationCode}
                onChange={(e) => setDestinationCode(e.target.value.toUpperCase().slice(0, 8))}
                placeholder="PMI, DXB…"
                className={inputClass}
              />
            </Field>
            {suite === "hotels" ? (
              <Field label="Minimum stars">
                <select
                  value={minStars}
                  onChange={(e) => setMinStars(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={0}>Any</option>
                  <option value={3}>3+</option>
                  <option value={4}>4+</option>
                  <option value={5}>5</option>
                </select>
              </Field>
            ) : null}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Searching…" : `Search ${section.label}`}
            </button>
          </div>
        </form>
      </SearchCard>

      {error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!error && result ? (
        result.empty ? (
          <div className="rounded-2xl border border-border/70 bg-card p-8 text-sm text-muted-foreground">
            {result.message}
          </div>
        ) : (
          <>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {result.total.toLocaleString()} {section.label.toLowerCase()} · page {result.page} of{" "}
              {result.pageCount}
            </p>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {result.items.map((item) => (
                <article
                  key={item.code}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-card"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      loading="lazy"
                      className="h-48 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center bg-muted text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                      {section.label}
                    </div>
                  )}
                  <div className="space-y-2 p-5">
                    <h2 className="text-base font-medium leading-snug">{item.title}</h2>
                    {item.location ? (
                      <p className="text-sm text-muted-foreground">{item.location}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {item.stars ? (
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-primary">
                          {item.stars}★
                        </span>
                      ) : null}
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {item.priceFrom != null ? (
                      <p className="pt-1 text-sm">
                        From {item.currency ?? ""} {item.priceFrom.toLocaleString()}
                      </p>
                    ) : null}
                    <p className="pt-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
                      HBX ref {item.supplierCode}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={loading || result.page <= 1}
                onClick={() => {
                  const next = Math.max(1, result.page - 1);
                  setPage(next);
                  void run(suite, next);
                }}
                className="rounded-full border border-border px-6 py-2 text-xs uppercase tracking-[0.3em] disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">Page {page}</span>
              <button
                type="button"
                disabled={loading || result.page >= result.pageCount}
                onClick={() => {
                  const next = result.page + 1;
                  setPage(next);
                  void run(suite, next);
                }}
                className="rounded-full border border-border px-6 py-2 text-xs uppercase tracking-[0.3em] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        )
      ) : null}
    </PageShell>
  );
}
