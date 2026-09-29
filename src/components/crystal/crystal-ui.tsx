import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { classifyCrystalVoyage } from "@/lib/crystal/inventory-status";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CRYSTAL_LICENCE_NOTICE } from "@/lib/crystal/content";
import { formatFare } from "@/lib/crystal/inventory";
import type { CrystalVoyage } from "@/lib/crystal/types";
import { mediaUrl } from "@/lib/media";

export function LicenceNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground ${className}`}
    >
      <span className="font-medium text-foreground">Licensed inventory only.</span>{" "}
      {CRYSTAL_LICENCE_NOTICE}
    </p>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-6 py-12 md:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
          ) : null}
          <h2 className="mt-2 font-serif text-2xl text-foreground md:text-3xl">{title}</h2>
          {intro ? <p className="mt-3 text-sm text-muted-foreground">{intro}</p> : null}
        </div>
        {action}
      </div>
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}

/** Shown wherever commercial data would appear but no licensed feed exists. */
export function AwaitingInventory({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-8 text-center">
      <p className="font-serif text-lg text-foreground">{label}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {hint ??
          "This panel fills automatically the moment Crystal's authorised feed is connected. Nothing is simulated in the meantime."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild size="sm">
          <Link to="/crystal-cruises/quote">Request a voyage quote</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/concierge" search={{ prompt: "Help me plan a Worldway Luxury Cruises voyage." }}>
            Ask the AI Cruise Concierge
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function VoyageCard({ voyage }: { voyage: CrystalVoyage }) {
  return (
    <Card className="group overflow-hidden border-border/60">
      <Link to="/crystal-cruises/voyages/$code" params={{ code: voyage.code }} className="block">
        {voyage.media.hero ? (
          <div className="h-48 overflow-hidden">
            <img
              src={mediaUrl(voyage.media.hero)}
              alt={`${voyage.title} — ${voyage.destinationName}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
        ) : null}
        <div className="space-y-2 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {voyage.destinationName} · {voyage.nights} nights · {voyage.shipName}
          </p>
          <h3 className="font-serif text-lg leading-snug">{voyage.title}</h3>
          <Badge variant={classifyCrystalVoyage(voyage) === "api_live" ? "default" : "outline"}>
            {classifyCrystalVoyage(voyage) === "api_live" ? "Live availability" : "Enquiry only"}
          </Badge>
          <p className="line-clamp-2 text-sm text-muted-foreground">{voyage.subtitle}</p>
          <div className="flex items-end justify-between pt-1">
            <span className="text-sm">
              <span className="text-muted-foreground">from </span>
              <span className="font-medium">{formatFare(voyage)}</span>
            </span>
            {voyage.promotions[0] ? (
              <Badge variant="secondary">{voyage.promotions[0]}</Badge>
            ) : null}
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function VoyageGrid({ voyages, empty }: { voyages: CrystalVoyage[]; empty: string }) {
  if (voyages.length === 0) return <AwaitingInventory label={empty} />;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {voyages.map((v) => (
        <VoyageCard key={v.code} voyage={v} />
      ))}
    </div>
  );
}

export function FaqList({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <dl className="divide-y divide-border/60 rounded-xl border border-border/60">
      {faqs.map((f) => (
        <div key={f.q} className="p-5">
          <dt className="font-medium text-foreground">{f.q}</dt>
          <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[11px] uppercase tracking-[0.2em]">
      <ol className="flex flex-wrap items-center gap-2 text-muted-foreground">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-2">
            {it.to ? (
              <Link to={it.to} className="hover:text-primary">
                {it.label}
              </Link>
            ) : (
              <span className="text-foreground">{it.label}</span>
            )}
            {i < items.length - 1 ? <span aria-hidden>/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
