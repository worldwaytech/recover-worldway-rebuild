import { Link } from "@tanstack/react-router";
import { ChevronRight, Check, Star } from "lucide-react";
import {
  type CollectionKind,
  type CollectionItem,
  collectionsMeta,
  formatMoney,
} from "@/lib/collections";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/site";

export function Breadcrumbs({
  crumbs,
}: {
  crumbs: { label: string; to?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-widest text-muted-foreground">
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
  item: CollectionItem;
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
          <span className="absolute left-3 top-3 rounded-sm bg-gold px-2.5 py-1 text-[0.6rem] uppercase tracking-wider text-gold-foreground">
            Signature
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow">{item.location}</p>
        <h3 className="mt-1 font-serif text-xl leading-snug group-hover:text-gold">
          {item.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          {item.duration && <span>{item.duration}</span>}
          {item.capacity && <span>· {item.capacity}</span>}
          {item.operator && <span>· {item.operator}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm font-medium">
            {formatMoney(item.priceFrom, item.priceUnit)}
          </span>
          <Link
            to={`${detailBase}/$slug`}
            params={{ slug: item.slug }}
            className="text-xs uppercase tracking-widest text-gold hover:text-foreground"
          >
            View →
          </Link>
        </div>
      </div>
    </article>
  );
}

export function CollectionLanding({
  kind,
  items,
}: {
  kind: CollectionKind;
  items: CollectionItem[];
}) {
  const meta = collectionsMeta[kind];
  const crumbs = [
    { label: "Home", to: "/" },
    ...(meta.breadcrumbParent ? [meta.breadcrumbParent] : []),
    { label: meta.title },
  ];

  return (
    <main>
      <section className="relative h-[60vh] min-h-[420px] overflow-hidden">
        <img src={meta.heroImage} alt={meta.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/25 to-ink/80" />
        <div className="container-lux relative z-10 flex h-full flex-col items-start justify-end pb-14 text-primary-foreground">
          <p className="eyebrow text-gold">{meta.eyebrow}</p>
          <h1 className="mt-3 font-serif text-5xl md:text-7xl">{meta.headline}</h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">{meta.intro}</p>
        </div>
      </section>

      <section className="border-b border-border bg-sand/30">
        <div className="container-lux py-4">
          <Breadcrumbs crumbs={crumbs} />
        </div>
      </section>

      <section className="container-lux py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {meta.benefits.map((b) => (
            <div key={b.title} className="rounded-sm border border-border bg-card p-6 shadow-soft">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Check className="h-4 w-4" />
              </div>
              <h3 className="mt-4 font-serif text-xl">{b.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-lux pb-16">
        <SectionHeading
          eyebrow={`Featured ${meta.itemNounPlural}`}
          title={`Selected ${meta.itemNounPlural}`}
          intro={`Hand-picked ${meta.itemNounPlural} across our full ${meta.title.toLowerCase()} collection. Speak with a specialist to explore the entire portfolio.`}
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CollectionItemCard key={item.slug} item={item} detailBase={meta.detailBasePath} />
          ))}
        </div>
      </section>

      <section className="bg-sand/40">
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
            Our specialists will craft a proposal within 72 hours, drawing from the world's finest {meta.itemNounPlural}.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/contact"><Button variant="gold" size="lg">Enquire now</Button></Link>
            <Link to="/trip-builder"><Button variant="outline-ink" size="lg">Trip builder</Button></Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function CollectionDetail({
  kind,
  item,
}: {
  kind: CollectionKind;
  item: CollectionItem;
}) {
  const meta = collectionsMeta[kind];
  const crumbs = [
    { label: "Home", to: "/" },
    ...(meta.breadcrumbParent ? [meta.breadcrumbParent] : []),
    { label: meta.title, to: meta.detailBasePath },
    { label: item.title },
  ];

  return (
    <main>
      <section className="relative h-[65vh] min-h-[460px] overflow-hidden">
        <img src={item.image} alt={item.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/45 via-ink/15 to-ink/85" />
        <div className="container-lux relative z-10 flex h-full flex-col items-start justify-end pb-14 text-primary-foreground">
          <p className="eyebrow text-gold">{item.location}</p>
          <h1 className="mt-3 font-serif text-4xl md:text-6xl max-w-4xl">{item.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-primary-foreground/85">{item.subtitle}</p>
        </div>
      </section>

      <section className="border-b border-border bg-sand/30">
        <div className="container-lux py-4">
          <Breadcrumbs crumbs={crumbs} />
        </div>
      </section>

      <section className="container-lux py-14">
        <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
          <div>
            <SectionHeading eyebrow="Overview" title={item.title} />
            <p className="mt-4 text-muted-foreground leading-relaxed">
              {item.subtitle}. A {meta.itemNoun} of the highest calibre, curated by our specialists to combine
              rare access, refined comfort and effortless logistics from start to finish.
            </p>

            <h3 className="mt-10 font-serif text-2xl">Highlights</h3>
            <ul className="mt-4 space-y-2">
              {item.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 border-l-2 border-gold pl-4 text-sm">
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
          </div>

          <aside className="rounded-sm border border-border bg-card p-6 shadow-soft h-fit lg:sticky lg:top-28">
            <p className="eyebrow mb-3">From</p>
            <p className="text-3xl font-serif">{formatMoney(item.priceFrom, item.priceUnit)}</p>
            <ul className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
              {item.duration && <li className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{item.duration}</span></li>}
              {item.capacity && <li className="flex justify-between"><span className="text-muted-foreground">Capacity</span><span>{item.capacity}</span></li>}
              {item.operator && <li className="flex justify-between"><span className="text-muted-foreground">Operator</span><span>{item.operator}</span></li>}
              <li className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{item.location}</span></li>
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <Link to="/contact"><Button variant="gold" className="w-full">Enquire</Button></Link>
              <Link to="/trip-builder"><Button variant="outline-ink" className="w-full">Customise</Button></Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
