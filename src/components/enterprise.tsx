// Shared enterprise UI primitives — FAQ, Gallery, Timeline, Comparison,
// Testimonials, Awards, Trust, CTA, EmptyState, Skeleton, Print layout.
// Every module in the reconstruction consumes these to guarantee a single
// WorldwayLuxe design language and easy accessibility upgrades.

import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Check, ShieldCheck, Award, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// -------- FAQ (accessible disclosure) --------
export function FAQGroup({
  items,
  title = "Frequently asked",
}: {
  items: { q: string; a: string }[];
  title?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section aria-label={title} className="rounded-sm border border-border bg-card p-2">
      <ul>
        {items.map((it, i) => {
          const isOpen = open === i;
          return (
            <li key={it.q} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between px-4 py-4 text-left"
              >
                <span className="font-serif text-lg">{it.q}</span>
                <ChevronDown
                  aria-hidden
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="px-4 pb-5 text-sm text-muted-foreground">{it.a}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// -------- Gallery (masonry-lite) --------
export function Gallery({ images, alt = "Gallery image" }: { images: string[]; alt?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((src, i) => (
        <figure
          key={src + i}
          className={`overflow-hidden rounded-sm ${i % 5 === 0 ? "lg:col-span-2 lg:row-span-2" : ""}`}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
          />
        </figure>
      ))}
    </div>
  );
}

// -------- Timeline --------
export function Timeline({ steps }: { steps: { title: string; text: string; when?: string }[] }) {
  return (
    <ol className="relative space-y-8 border-l border-border pl-8">
      {steps.map((s, i) => (
        <li key={s.title}>
          <span className="absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-gold bg-background" />
          {s.when && <p className="eyebrow mb-1">{s.when}</p>}
          <h3 className="font-serif text-xl">
            {i + 1}. {s.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

// -------- Comparison table --------
export function ComparisonTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string; highlight?: boolean }[];
  rows: { label: string; values: (string | boolean)[] }[];
}) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 text-left font-medium text-muted-foreground">Feature</th>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`p-4 text-left font-serif text-lg ${c.highlight ? "text-gold" : ""}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-b-0">
              <td className="p-4 text-muted-foreground">{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className="p-4">
                  {typeof v === "boolean" ? (
                    v ? <Check className="h-4 w-4 text-gold" /> : <span className="text-border">—</span>
                  ) : (
                    v
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -------- Testimonials --------
export function Testimonials({
  quotes,
}: {
  quotes: { quote: string; author: string; role?: string; rating?: number }[];
}) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {quotes.map((q) => (
        <figure key={q.author} className="rounded-sm border border-border bg-card p-6 shadow-soft">
          {q.rating && (
            <div className="mb-3 flex gap-0.5" aria-label={`${q.rating} out of 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${i < (q.rating ?? 0) ? "fill-gold text-gold" : "text-border"}`}
                />
              ))}
            </div>
          )}
          <blockquote className="font-serif text-lg leading-snug">"{q.quote}"</blockquote>
          <figcaption className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
            {q.author}
            {q.role && ` · ${q.role}`}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

// -------- Awards & Trust --------
export function AwardsStrip({ awards }: { awards: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-y border-border py-6 text-xs uppercase tracking-widest text-muted-foreground">
      {awards.map((a) => (
        <span key={a} className="flex items-center gap-2">
          <Award className="h-4 w-4 text-gold" /> {a}
        </span>
      ))}
    </div>
  );
}

export function TrustIndicators() {
  const items = [
    { icon: ShieldCheck, title: "ATOL & IATA protected", text: "Every payment held in a segregated trust account." },
    { icon: Sparkles, title: "72-hour proposal promise", text: "A hand-crafted itinerary from a specialist within three days." },
    { icon: Award, title: "Virtuoso member agency", text: "Access to preferential rates and VIP amenities worldwide." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="flex gap-4 rounded-sm border border-border bg-card p-5">
          <it.icon className="h-6 w-6 shrink-0 text-gold" />
          <div>
            <p className="font-serif text-lg">{it.title}</p>
            <p className="text-sm text-muted-foreground">{it.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// -------- CTA --------
export function CTASection({
  eyebrow = "Speak with a specialist",
  title,
  intro,
  primaryTo = "/contact",
  primaryLabel = "Enquire now",
  secondaryTo,
  secondaryLabel,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  primaryTo?: string;
  primaryLabel?: string;
  secondaryTo?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-10 text-center shadow-soft">
      <p className="eyebrow text-gold">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl md:text-4xl">{title}</h2>
      {intro && <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{intro}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to={primaryTo}>
          <Button variant="gold" size="lg">
            {primaryLabel}
          </Button>
        </Link>
        {secondaryTo && secondaryLabel && (
          <Link to={secondaryTo}>
            <Button variant="outline-ink" size="lg">
              {secondaryLabel}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// -------- Empty / Loading / Print --------
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-dashed border-border bg-card/60 p-10 text-center">
      <p className="font-serif text-2xl">{title}</p>
      {text && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-border/50 ${className}`} />;
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-sm border border-border bg-card p-4 shadow-soft">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="mt-4 h-4 w-1/3" />
          <Skeleton className="mt-2 h-6 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="print:bg-white print:text-black print:mx-0 print:my-0 print:max-w-none">
      {children}
    </div>
  );
}
