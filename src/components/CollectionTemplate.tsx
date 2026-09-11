import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Check,
  Star,
  Heart,
  Share2,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { type CollectionKind, collectionsMeta, formatMoney } from "@/lib/collections";
import type { CatalogueFilters, CatalogueProduct, SortKey } from "@/lib/catalogue-types";
import { queryCatalogue, relatedProducts } from "@/lib/catalogue-engine";
import { CollectionToolbar } from "@/components/catalogue/collection-toolbar";
import { QuoteRequestDialog } from "@/components/catalogue/quote-request-dialog";
import { BookingPanel } from "@/components/catalogue/booking-panel";
import { locatePlace, siblingCities } from "@/lib/geo-locate";
import { buildItinerary } from "@/lib/itinerary";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { saveToWishlist, trackCatalogueEvent } from "@/lib/catalogue-client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow && <p className="eyebrow text-gold">{eyebrow}</p>}
      <h2 className="mt-2 font-serif text-3xl md:text-4xl">{title}</h2>
      {intro && <p className="mt-3 text-sm text-muted-foreground">{intro}</p>}
    </div>
  );
}

export function Breadcrumbs({ crumbs }: { crumbs: { label: string; to?: string }[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="text-xs uppercase tracking-widest text-muted-foreground"
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {c.to ? (
              <Link to={c.to} className="hover:text-gold">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
            {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CollectionItemCard({
  item,
  detailBase,
}: {
  item: CatalogueProduct;
  detailBase: string;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-sm border border-border bg-card shadow-soft transition-shadow hover:shadow-elegant">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        {item.featured && (
          <span className="absolute left-3 top-3 rounded-sm bg-primary px-2.5 py-1 text-[0.6rem] uppercase tracking-wider text-primary-foreground">
            Signature
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-sm bg-background/85 px-2 py-1 text-[0.6rem] uppercase tracking-wider text-foreground">
          {item.supplierStatus === "live" ? "Live availability" : "On request"}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow">{item.location}</p>
        <h3 className="mt-1 font-serif text-xl leading-snug group-hover:text-gold">{item.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          {item.duration && <span>{item.duration}</span>}
          {item.capacity && <span>· {item.capacity}</span>}
          {item.operator && <span>· {item.operator}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm font-medium">{formatMoney(item.priceFrom, item.priceUnit)}</span>
          <Link
            to={`${detailBase}/$slug` as "/cruises/$slug"}
            params={{ slug: item.slug }}
            onClick={() => trackCatalogueEvent("cta_click", { kind: item.kind, slug: item.slug })}
            className="text-xs uppercase tracking-widest text-gold hover:text-foreground"
          >
            View →
          </Link>
        </div>
      </div>
    </article>
  );
}

const PAGE_SIZE = 9;

export function CollectionLanding({
  kind,
  featureSection,
}: {
  kind: CollectionKind;
  /** Optional supplier-specific section rendered above the featured grid. */
  featureSection?: React.ReactNode;
}) {

  const meta = collectionsMeta[kind];
  const [filters, setFilters] = useState<CatalogueFilters>({});
  const [sort, setSort] = useState<SortKey>("recommended");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const result = useMemo(
    () => queryCatalogue({ kind, ...filters, sort, page, pageSize: PAGE_SIZE }),
    [kind, filters, sort, page],
  );

  useEffect(() => {
    trackCatalogueEvent("collection_view", { kind });
  }, [kind]);

  const applyFilters = (next: CatalogueFilters) => {
    setFilters(next);
    setPage(1);
    trackCatalogueEvent("filter_used", {
      kind,
      query: next.q,
      filters: next as Record<string, unknown>,
    });
  };

  const crumbs = [
    { label: "Home", to: "/" },
    ...(meta.breadcrumbParent ? [meta.breadcrumbParent] : []),
    { label: meta.title },
  ];
  const relatedCollections = Object.values(collectionsMeta)
    .filter(
      (m) =>
        m.slug !== kind &&
        (m.breadcrumbParent?.to === meta.detailBasePath ||
          meta.breadcrumbParent?.to === m.detailBasePath ||
          m.slug.split("-")[0] === kind.split("-")[0]),
    )
    .slice(0, 4);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative h-[60vh] min-h-[420px] overflow-hidden">
          <img
            src={meta.heroImage}
            alt={meta.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/25 to-background/90" />
          <div className="container-lux relative z-10 flex h-full flex-col items-start justify-end pb-14">
            <p className="eyebrow text-gold">{meta.eyebrow}</p>
            <h1 className="mt-3 font-serif text-5xl md:text-7xl">{meta.headline}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{meta.intro}</p>
          </div>
        </section>

        <section className="border-b border-border bg-card/40">
          <div className="container-lux py-4">
            <Breadcrumbs crumbs={crumbs} />
          </div>
        </section>

        <section className="container-lux py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {meta.benefits.map((b) => (
              <div
                key={b.title}
                className="rounded-sm border border-border bg-card p-6 shadow-soft"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-gold">
                  <Check className="h-4 w-4" />
                </div>
                <h3 className="mt-4 font-serif text-xl">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
              </div>
            ))}
          </div>
        </section>

        {featureSection}

        <section className="container-lux pb-16">


          <SectionHeading
            eyebrow={`Featured ${meta.itemNounPlural}`}
            title={`Selected ${meta.itemNounPlural}`}
            intro={`Hand-picked ${meta.itemNounPlural} across our full ${meta.title.toLowerCase()} collection. Speak with a specialist to explore the entire portfolio.`}
          />
          <div className="mt-8">
            <CollectionToolbar
              filters={filters}
              facets={result.facets}
              sort={sort}
              total={result.total}
              itemNounPlural={meta.itemNounPlural}
              onFilters={applyFilters}
              onSort={(s) => {
                setSort(s);
                setPage(1);
              }}
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
            />
          </div>

          {result.supplierNote && (
            <p className="mt-4 flex items-start gap-2 rounded-sm border border-border bg-card/60 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              {result.supplierNote}
            </p>
          )}

          {result.items.length === 0 ? (
            <div className="mt-10 rounded-sm border border-border bg-card p-10 text-center">
              <p className="font-serif text-2xl">No {meta.itemNounPlural} match those filters</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Broaden your criteria, or let a specialist source it for you.
              </p>
              <Button className="mt-5" variant="outline" onClick={() => applyFilters({})}>
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((item) => (
                <CollectionItemCard key={item.slug} item={item} detailBase={meta.detailBasePath} />
              ))}
            </div>
          )}

          {result.pageCount > 1 && (
            <div className="mt-10 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={result.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Page {result.page} of {result.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={result.page >= result.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>

        {relatedCollections.length > 0 && (
          <section className="container-lux pb-16">
            <SectionHeading eyebrow="Explore further" title="Related collections" />
            <div className="mt-6 flex flex-wrap gap-3">
              {relatedCollections.map((m) => (
                <Link
                  key={m.slug}
                  to={m.detailBasePath}
                  className="rounded-sm border border-border bg-card px-4 py-2 text-sm hover:border-gold hover:text-gold"
                >
                  {m.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="bg-card/40">
          <div className="container-lux py-16">
            <SectionHeading eyebrow="Frequently asked" title="Common questions" />
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {meta.faqs.map((f) => (
                <div key={f.q} className="rounded-sm border border-border bg-card p-5">
                  <p className="font-serif text-lg">{f.q}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container-lux py-16">
          <div className="rounded-sm border border-border bg-card p-10 text-center shadow-soft">
            <p className="eyebrow text-gold">Speak with a specialist</p>
            <h2 className="mt-3 font-serif text-3xl md:text-4xl">Design your {meta.itemNoun}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Our specialists will craft a proposal within 72 hours, drawing from the world's finest{" "}
              {meta.itemNounPlural}.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/contact">
                <Button size="lg">Enquire now</Button>
              </Link>
              <Link to="/trip-builder">
                <Button variant="outline" size="lg">
                  Trip builder
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

export function CollectionDetail({ kind, item }: { kind: CollectionKind; item: CatalogueProduct }) {
  return <CollectionDetailInner kind={kind} item={item} />;
}

function GeoTrail({ geo }: { geo: ReturnType<typeof locatePlace> }) {
  if (!geo.region) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Link to="/destinations" className="hover:text-gold">
        World
      </Link>
      <ChevronRight className="h-3 w-3" />
      <Link
        to="/destinations/$region"
        params={{ region: geo.region.slug }}
        className="hover:text-gold"
      >
        {geo.region.name}
      </Link>
      {geo.country && (
        <>
          <ChevronRight className="h-3 w-3" />
          <Link
            to="/destinations/$region/$country"
            params={{ region: geo.region.slug, country: geo.country.slug }}
            className="hover:text-gold"
          >
            {geo.country.name}
          </Link>
        </>
      )}
      {geo.state && (
        <>
          <ChevronRight className="h-3 w-3" />
          <span>{geo.state}</span>
        </>
      )}
      {geo.destination && geo.country && (
        <>
          <ChevronRight className="h-3 w-3" />
          <Link
            to="/destinations/$region/$country/$destination"
            params={{
              region: geo.region.slug,
              country: geo.country.slug,
              destination: geo.destination.slug,
            }}
            className="text-foreground hover:text-gold"
          >
            {geo.destination.name}
          </Link>
        </>
      )}
    </div>
  );
}

function CollectionDetailInner({ kind, item }: { kind: CollectionKind; item: CatalogueProduct }) {
  const meta = collectionsMeta[kind];
  const related = useMemo(() => relatedProducts(item), [item]);
  const geo = useMemo(() => locatePlace(item.location, item.country, item.region), [item]);
  const cities = useMemo(() => siblingCities(geo), [geo]);
  const itinerary = useMemo(() => buildItinerary(item), [item]);

  useEffect(() => {
    trackCatalogueEvent("product_view", { kind, slug: item.slug });
  }, [kind, item.slug]);

  async function onSave() {
    try {
      await saveToWishlist(item);
      toast.success("Saved to your wishlist.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this.");
    }
  }

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: item.title, text: item.subtitle, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard.");
      }
    } catch {
      /* share cancelled */
    }
  }

  const crumbs = [
    { label: "Home", to: "/" },
    ...(meta.breadcrumbParent ? [meta.breadcrumbParent] : []),
    { label: meta.title, to: meta.detailBasePath },
    { label: item.title },
  ];

  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative h-[65vh] min-h-[460px] overflow-hidden">
          <img
            src={item.image}
            alt={item.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-background/20 to-background/95" />
          <div className="container-lux relative z-10 flex h-full flex-col items-start justify-end pb-14">
            <p className="eyebrow text-gold">{item.location}</p>
            <h1 className="mt-3 max-w-4xl font-serif text-4xl md:text-6xl">{item.title}</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{item.subtitle}</p>
          </div>
        </section>

        <section className="border-b border-border bg-card/40">
          <div className="container-lux py-4">
            <Breadcrumbs crumbs={crumbs} />
            <GeoTrail geo={geo} />
          </div>
        </section>

        <section className="container-lux py-14">
          <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
            <div>
              <SectionHeading eyebrow="Overview" title={item.title} />
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {item.subtitle}. A {meta.itemNoun} of the highest calibre, curated by our
                specialists to combine rare access, refined comfort and effortless logistics from
                start to finish.
              </p>

              <h3 className="mt-10 font-serif text-2xl">Highlights</h3>
              <ul className="mt-4 space-y-2">
                {item.highlights.map((h) => (
                  <li
                    key={h}
                    className="flex items-start gap-2 border-l-2 border-primary pl-4 text-sm"
                  >
                    <Star className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              {item.inclusions && item.inclusions.length > 0 && (
                <>
                  <h3 className="mt-10 font-serif text-2xl">What's included</h3>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {item.inclusions.map((inc) => (
                      <li key={inc} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 text-gold" /> {inc}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3 className="mt-10 font-serif text-2xl">Day-by-day itinerary</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {itinerary.length} days · {item.location}. Every day can be privatised, extended or
                reshaped by your specialist.
              </p>
              <Accordion type="single" collapsible className="mt-4" defaultValue="day-1">
                {itinerary.map((day) => (
                  <AccordionItem key={day.day} value={`day-${day.day}`}>
                    <AccordionTrigger className="text-left">
                      <span className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-sm bg-primary/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-widest text-gold">
                          Day {day.day}
                        </span>
                        <span className="font-serif text-base">{day.title}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      <p>{day.summary}</p>
                      <p className="mt-3 text-xs uppercase tracking-widest">
                        Meals: {day.meals} · Stay: {day.stay}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {cities.length > 0 && geo.region && geo.country && (
                <>
                  <h3 className="mt-10 font-serif text-2xl">Explore {geo.country.name}</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cities.map((c) => (
                      <Link
                        key={c.slug}
                        to="/destinations/$region/$country/$destination"
                        params={{
                          region: geo.region!.slug,
                          country: geo.country!.slug,
                          destination: c.slug,
                        }}
                        className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs hover:border-gold hover:text-gold"
                      >
                        {c.name}
                        {c.state ? ` · ${c.state}` : ""}
                      </Link>
                    ))}
                  </div>
                </>
              )}

              <h3 className="mt-10 font-serif text-2xl">Not included</h3>
              <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li>Personal expenses, spa treatments and premium beverages unless stated</li>
                <li>Travel insurance (arranged separately by our team)</li>
                <li>Visas, vaccinations and consular fees</li>
                <li>Discretionary gratuities where not stated</li>
              </ul>

              <h3 className="mt-10 font-serif text-2xl">Where you'll be</h3>
              <div className="mt-4 overflow-hidden rounded-sm border border-border">
                <iframe
                  title={`Map of ${item.location}`}
                  loading="lazy"
                  className="h-[320px] w-full"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=-180%2C-60%2C180%2C75&layer=mapnik&marker=`}
                />
                <p className="flex items-center gap-2 border-t border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-gold" /> {item.location}
                  {item.region ? ` · ${item.region}` : ""}
                </p>
              </div>

              <h3 className="mt-10 font-serif text-2xl">Supplier</h3>
              <div className="mt-4 rounded-sm border border-border bg-card p-5 text-sm">
                <p className="font-medium">{item.supplier}</p>
                <p className="mt-1 text-muted-foreground">
                  {item.supplierStatus === "live"
                    ? "Connected to live supplier availability — pricing confirmed at time of booking."
                    : "Availability and final pricing confirmed by a Worldway specialist within 24 hours."}
                </p>
              </div>

              <h3 className="mt-10 font-serif text-2xl">Cancellation policy</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Deposits are refundable up to 90 days before departure, less any supplier fees.
                Between 90 and 45 days, 50% of the total is retained; inside 45 days the booking is
                non-refundable. Cancel-for-any-reason cover is available through our{" "}
                <Link to="/insurance" className="text-gold hover:underline">
                  travel insurance
                </Link>{" "}
                desk.
              </p>

              <div className="mt-10 rounded-sm border border-border bg-card p-6">
                <p className="eyebrow text-gold">AI Concierge</p>
                <h3 className="mt-2 font-serif text-2xl">Plan this with the concierge</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Compare this {meta.itemNoun} against alternatives, build a full itinerary around
                  it and generate an indicative quotation in seconds.
                </p>
                <Link
                  to="/concierge"
                  search={
                    {
                      prompt: `Help me plan ${item.title} in ${item.location}. Compare it with similar ${meta.itemNounPlural} and outline an itinerary and budget.`,
                    } as never
                  }
                  onClick={() =>
                    trackCatalogueEvent("ai_assisted_conversion", { kind, slug: item.slug })
                  }
                >
                  <Button className="mt-4">
                    <Sparkles className="mr-2 h-4 w-4" /> Ask the AI Concierge
                  </Button>
                </Link>
              </div>
            </div>

            <aside className="h-fit space-y-6 lg:sticky lg:top-28">
              <BookingPanel product={item} />
              <div className="rounded-sm border border-border bg-card p-6 shadow-soft">
              <p className="eyebrow mb-3">From</p>
              <p className="font-serif text-3xl">{formatMoney(item.priceFrom, item.priceUnit)}</p>
              <ul className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
                {item.duration && (
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{item.duration}</span>
                  </li>
                )}
                {item.capacity && (
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Capacity</span>
                    <span>{item.capacity}</span>
                  </li>
                )}
                {item.operator && (
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Operator</span>
                    <span>{item.operator}</span>
                  </li>
                )}
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span>{item.location}</span>
                </li>
              </ul>
              <div className="mt-6 flex flex-col gap-2">
                <QuoteRequestDialog
                  product={item}
                  trigger={<Button className="w-full">Request a quote</Button>}
                />
                <Link to="/trip-builder">
                  <Button variant="outline" className="w-full">
                    Customise
                  </Button>
                </Link>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={onSave}>
                    <Heart className="mr-2 h-4 w-4" /> Save
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={onShare}>
                    <Share2 className="mr-2 h-4 w-4" /> Share
                  </Button>
                </div>
              </div>
              <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                Members receive priority allocation, complimentary upgrades where available and a
                dedicated specialist for this {meta.itemNoun}.
              </p>
              </div>
            </aside>
          </div>
        </section>

        {related.length > 0 && (
          <section className="container-lux pb-16">
            <SectionHeading eyebrow="You may also like" title="Related journeys" />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <CollectionItemCard
                  key={`${r.kind}-${r.slug}`}
                  item={r}
                  detailBase={r.detailBase}
                />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
