import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PageShell, PageHero } from "@/components/search-shell";
import { ToursCatalogue, type ToursSearchState } from "@/components/tours-catalogue";
import { BROWSE_HUBS, HUB_GROUPS, hubBySlug, type BrowseHub } from "@/lib/browse-hubs";
import { useSavedSearches } from "@/lib/tour-shortlist";
import { track } from "@/lib/analytics";
import { mediaUrl } from "@/lib/media";

export function Breadcrumbs({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-6 pt-8">
      <ol className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {trail.map((c, i) => (
          <li key={c.label} className="flex items-center gap-2">
            {c.to ? (
              <Link to={c.to as never} className="transition-colors hover:text-primary">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
            {i < trail.length - 1 ? <span aria-hidden>/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="text-[11px] uppercase tracking-[0.3em] text-primary">{eyebrow}</div>
      <h2 className="mt-3 font-serif text-2xl text-foreground md:text-3xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function HubGrid({ slugs, exclude }: { slugs: string[]; exclude?: string }) {
  const hubs = slugs
    .map(hubBySlug)
    .filter((h): h is BrowseHub => Boolean(h) && h!.slug !== exclude);
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {hubs.map((h) => (
        <Link
          key={h.slug}
          to="/tours/browse/$hub"
          params={{ hub: h.slug }}
          onClick={() => track("browse_hub_click", { hub: h.slug })}
          className="group overflow-hidden rounded-2xl border border-border/60 bg-card/70 transition-colors hover:border-primary/50"
        >
          <div className="aspect-[16/10] w-full overflow-hidden bg-muted/30">
            <img
              src={mediaUrl(h.image)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
          <div className="space-y-2 p-5">
            <div className="text-[10px] uppercase tracking-[0.24em] text-primary">{h.eyebrow}</div>
            <h3 className="font-serif text-lg text-foreground">{h.title}</h3>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{h.intro}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SavedSearchBar({ hub, label }: { hub: string; label: string }) {
  const { searches, save, remove } = useSavedSearches();
  const [path, setPath] = useState("");

  useEffect(() => {
    setPath(window.location.pathname + window.location.search);
  }, [hub]);

  const stored = searches.find((s) => s.path === path);
  return (
    <section className="mx-auto max-w-6xl px-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-5 py-4">
        <button
          type="button"
          onClick={() => {
            const current = window.location.pathname + window.location.search;
            setPath(current);
            if (stored) remove(current);
            else {
              save(label, current);
              track("saved_search_create", { hub });
            }
          }}
          className={`rounded-full border px-5 py-2 text-[10px] uppercase tracking-[0.24em] transition-colors ${
            stored
              ? "border-primary bg-primary text-primary-foreground"
              : "border-primary/50 text-primary hover:bg-primary/10"
          }`}
        >
          {stored ? "Search saved" : "Save this search"}
        </button>
        {searches.slice(0, 4).map((s) => (
          <a
            key={s.id}
            href={s.path}
            className="rounded-full border border-border/60 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            {s.label}
          </a>
        ))}
      </div>
    </section>
  );
}

export function BrowseHubPage({ hub, search }: { hub: BrowseHub; search: ToursSearchState }) {
  useEffect(() => {
    track("browse_hub_view", { hub: hub.slug });
  }, [hub.slug]);

  return (
    <PageShell>
      <PageHero eyebrow={hub.eyebrow} title={hub.headline} subtitle={hub.intro} image={hub.image} />
      <Breadcrumbs
        trail={[
          { label: "Home", to: "/" },
          { label: "Tours", to: "/tours" },
          { label: "Browse", to: "/tours/browse" },
          { label: hub.title },
        ]}
      />

      {hub.mode === "request" ? (
        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8">
            <div className="text-[11px] uppercase tracking-[0.3em] text-primary">By request</div>
            <h2 className="mt-3 font-serif text-2xl text-foreground">
              Quoted individually by our desk
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {hub.title} is not sold from a live inventory feed. Send your route, dates and party
              size and we return priced options from our authorised operator network.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={(hub.requestHref ?? "/contact") as never}
                className="rounded-full border border-primary/50 bg-primary/10 px-7 py-3 text-[10px] uppercase tracking-[0.28em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                Open the desk
              </Link>
              <Link
                to="/concierge"
                className="rounded-full border border-border/60 px-7 py-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                Ask the AI concierge
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="pt-20" />
          <ToursCatalogue
            initial={search}
            lock={hub.lock}
            basePath={`/tours/browse/${hub.slug}`}
            showFacets={false}
            label={hub.title}
          />
          <SavedSearchBar hub={hub.slug} label={hub.title} />
        </>
      )}

      <Section eyebrow="Keep exploring" title="Related collections">
        <HubGrid slugs={hub.related} exclude={hub.slug} />
      </Section>

      <Section eyebrow="Good to know" title="Questions we are asked most">
        <dl className="divide-y divide-border/50 rounded-2xl border border-border/50 bg-card/40">
          {hub.faqs.map((f) => (
            <div key={f.q} className="p-6">
              <dt className="font-serif text-base text-foreground">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </PageShell>
  );
}

export function BrowseIndexPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Browse"
        title="Every way to travel with us."
        subtitle="Twenty-six curated collections, each populated live from our licensed operator inventory."
        image="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80"
      />
      <Breadcrumbs
        trail={[{ label: "Home", to: "/" }, { label: "Tours", to: "/tours" }, { label: "Browse" }]}
      />
      {HUB_GROUPS.map((g) => (
        <Section key={g.title} eyebrow="Collections" title={g.title}>
          <HubGrid slugs={g.slugs} />
        </Section>
      ))}
      <p className="sr-only">{BROWSE_HUBS.length} collections available.</p>
    </PageShell>
  );
}
