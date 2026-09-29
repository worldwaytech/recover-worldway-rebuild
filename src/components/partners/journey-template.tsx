// Reusable, template-driven detail experience for every luxury vertical.
// The vertical template (see src/lib/partners/templates.ts) decides which
// sections render and how the product is transacted; the journey model
// supplies the content. Partner feeds therefore populate all 11 verticals
// without any new page code.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JourneyGrid, DemoNotice } from "@/components/partners/journey-ui";
import { QuoteRequestDialog } from "@/components/catalogue/quote-request-dialog";
import { formatJourneyPrice, journeyToProduct, type Journey } from "@/lib/journeys";
import {
  templateForKind,
  getTemplate,
  hasSection,
  type VerticalTemplate,
} from "@/lib/partners/templates";
import {
  Check,
  MapPin,
  Users,
  CalendarDays,
  Star,
  Ship,
  BedDouble,
  Compass,
  UtensilsCrossed,
  FileText,
} from "lucide-react";
import { mediaUrl } from "@/lib/media";

function specValue(j: Journey, key: string): { label: string; value: string; icon: ReactNode } {
  switch (key) {
    case "route":
      return {
        label: "Route",
        value: j.cities.slice(0, 3).join(" · ") || j.country,
        icon: <MapPin className="h-4 w-4" />,
      };
    case "group":
      return {
        label: "Group",
        value: `${j.groupStyle}, max ${j.groupSizeMax}`,
        icon: <Users className="h-4 w-4" />,
      };
    case "rating":
      return {
        label: "Rating",
        value: `${j.rating} (${j.reviewCount})`,
        icon: <Star className="h-4 w-4" />,
      };
    case "vessel":
      return {
        label: "Vessel",
        value: j.vessel?.name ?? j.ships[0] ?? j.rail[0] ?? "Confirmed on request",
        icon: <Ship className="h-4 w-4" />,
      };
    case "cabins":
      return {
        label: "Suites",
        value: j.vessel?.cabins ? `${j.vessel.cabins} suites` : "On request",
        icon: <BedDouble className="h-4 w-4" />,
      };
    case "guides":
      return {
        label: "Guiding",
        value: j.vessel?.crew ? `${j.vessel.crew} crew & guides` : "Expert-led throughout",
        icon: <Compass className="h-4 w-4" />,
      };
    case "meals":
      return {
        label: "Dining",
        value: j.mealPlan || "On request",
        icon: <UtensilsCrossed className="h-4 w-4" />,
      };
    default:
      return {
        label: "Duration",
        value: `${j.durationDays} days`,
        icon: <CalendarDays className="h-4 w-4" />,
      };
  }
}

function MapSection({ j }: { j: Journey }) {
  const points = j.waypoints ?? [];
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const pad = 2;
  const bbox = [
    Math.min(...lngs) - pad,
    Math.min(...lats) - pad,
    Math.max(...lngs) + pad,
    Math.max(...lats) + pad,
  ].join(",");
  return (
    <section>
      <h2 className="font-serif text-2xl">Route map</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
        <iframe
          title={`Route map for ${j.title}`}
          loading="lazy"
          className="h-[320px] w-full"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`}
        />
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {points.map((p) => (
          <li key={`${p.name}-${p.lat}`}>
            <Badge variant="secondary">
              {p.day ? `Day ${p.day} · ` : ""}
              {p.name}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GallerySection({ j }: { j: Journey }) {
  const images = j.media.gallery?.length ? j.media.gallery : [j.media.hero];
  if (images.length < 2) return null;
  return (
    <section>
      <h2 className="font-serif text-2xl">Gallery</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {images.slice(0, 9).map((src, i) => (
          <img
            key={src}
            src={mediaUrl(src)}
            loading="lazy"
            alt={`${j.title} — image ${i + 1}`}
            className="h-40 w-full rounded-lg object-cover"
          />
        ))}
      </div>
    </section>
  );
}

function VesselSection({ j, heading }: { j: Journey; heading: string }) {
  const v = j.vessel;
  if (!v) return null;
  const facts = [
    v.type && { label: "Type", value: v.type },
    v.guests && { label: "Guests", value: String(v.guests) },
    v.cabins && { label: "Suites / cabins", value: String(v.cabins) },
    v.bedrooms && { label: "Bedrooms", value: String(v.bedrooms) },
    v.crew && { label: "Crew", value: String(v.crew) },
    v.yearBuilt && { label: "Built / refit", value: String(v.yearBuilt) },
    v.iceClass && { label: "Ice class", value: v.iceClass },
  ].filter(Boolean) as { label: string; value: string }[];
  return (
    <section>
      <h2 className="font-serif text-2xl">{heading}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{v.name}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</p>
            <p className="mt-1 text-sm">{f.value}</p>
          </div>
        ))}
      </div>
      {v.amenities?.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {v.amenities.map((a) => (
            <li key={a}>
              <Badge variant="outline">{a}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {v.cabinGrades?.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {v.cabinGrades.map((c) => (
            <Card key={c.name}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
                <p className="mt-2 text-sm">
                  from {j.currency} {c.priceFrom.toLocaleString()} ·{" "}
                  {c.available ? "available" : "waitlist"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AvailabilitySection({ j }: { j: Journey }) {
  const months = new Map<string, { date: string; state: string }[]>();
  for (const d of j.departures) {
    const key = d.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), { date: d.date, state: d.availability }]);
  }
  for (const d of j.availableDates ?? []) {
    const key = d.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), { date: d, state: "available" }]);
  }
  if (months.size === 0) return null;
  return (
    <section>
      <h2 className="font-serif text-2xl">Availability calendar</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from(months.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, dates]) => (
            <div key={month} className="rounded-lg border border-border/60 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{month}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {dates.map((d) => (
                  <li key={d.date} className="flex items-center justify-between">
                    <span>{d.date}</span>
                    <span className="text-xs text-muted-foreground">{d.state}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}

function DocumentsSection({ j }: { j: Journey }) {
  const docs = [
    ...(j.documents ?? []),
    ...(j.media.brochureUrl
      ? [{ title: "Journey brochure", url: j.media.brochureUrl, kind: "brochure" as const }]
      : []),
  ];
  if (docs.length === 0) return null;
  return (
    <section>
      <h2 className="font-serif text-xl">Documents</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {docs.map((d) => (
          <li key={d.url}>
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
            >
              <FileText className="h-4 w-4" />
              {d.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FaqSection({ j }: { j: Journey }) {
  if (!j.faqs?.length) return null;
  return (
    <section>
      <h2 className="font-serif text-xl">Frequently asked</h2>
      <Accordion type="single" collapsible className="mt-3">
        {j.faqs.map((f, i) => (
          <AccordionItem key={f.question} value={`faq${i}`}>
            <AccordionTrigger className="text-left text-sm">{f.question}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              {f.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function ctaLabel(template: VerticalTemplate) {
  if (template.transaction === "instant-book") return "Book this departure";
  if (template.transaction === "request-to-book") return "Reserve — request to book";
  return "Request a quotation";
}

export function JourneyTemplate({ journey: j, related }: { journey: Journey; related: Journey[] }) {
  const template =
    (j.templateId ? getTemplate(j.templateId) : null) ?? templateForKind(j.collectionKind);
  const product = journeyToProduct(j);

  return (
    <article className="pb-20">
      <header className="relative h-[52vh] min-h-[380px] w-full overflow-hidden">
        <img
          src={mediaUrl(j.media.hero)}
          alt={`${j.title} in ${j.country}`}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-6xl px-4 pb-8">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-background/90 text-foreground">{template.label}</Badge>
            <Badge variant="secondary">{j.collection}</Badge>
            {j.dataSource === "demonstration" ? (
              <Badge variant="outline">Sample itinerary</Badge>
            ) : null}
          </div>
          <h1 className="mt-3 font-serif text-4xl md:text-5xl">{j.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{j.subtitle}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          <DemoNotice />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {template.specs.map((key) => {
              const s = specValue(j, key);
              return (
                <div key={key} className="rounded-lg border border-border/60 p-3">
                  <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {s.icon}
                    {s.label}
                  </p>
                  <p className="mt-1 text-sm">{s.value}</p>
                </div>
              );
            })}
          </div>

          {hasSection(template, "overview") && (
            <section>
              <p className="text-sm uppercase tracking-wider text-muted-foreground">
                {template.tagline}
              </p>
            </section>
          )}

          {hasSection(template, "highlights") && j.highlights.length > 0 && (
            <section>
              <h2 className="font-serif text-2xl">Journey highlights</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {j.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasSection(template, "itinerary") && j.itinerary.length > 0 && (
            <section>
              <h2 className="font-serif text-2xl">Day by day</h2>
              <Accordion type="single" collapsible className="mt-4">
                {j.itinerary.map((day) => (
                  <AccordionItem key={day.day} value={`d${day.day}`}>
                    <AccordionTrigger className="text-left">
                      <span className="text-sm">
                        <span className="text-muted-foreground">Day {day.day} — </span>
                        {day.title}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground">{day.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {day.location}
                        {day.accommodation ? ` · ${day.accommodation}` : ""}
                        {day.meals.length ? ` · Meals: ${day.meals.join(", ")}` : ""}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}

          {hasSection(template, "map") && <MapSection j={j} />}
          {hasSection(template, "gallery") && <GallerySection j={j} />}
          {hasSection(template, "vessel") && <VesselSection j={j} heading="Your vessel" />}
          {hasSection(template, "residence") && (
            <VesselSection j={j} heading="Your residence & camps" />
          )}

          {hasSection(template, "inclusions") && (
            <section className="grid gap-8 sm:grid-cols-2">
              <div>
                <h2 className="font-serif text-xl">What&apos;s included</h2>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {j.inclusions.map((i) => (
                    <li key={i}>· {i}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="font-serif text-xl">Not included</h2>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {j.exclusions.map((i) => (
                    <li key={i}>· {i}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {hasSection(template, "extensions") && j.extensions.length > 0 && (
            <section>
              <h2 className="font-serif text-xl">Extensions</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {j.extensions.map((e) => (
                  <Card key={e.title}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.nights} nights · from {j.currency} {e.priceFrom.toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {hasSection(template, "availability") && <AvailabilitySection j={j} />}

          {hasSection(template, "reviews") && j.reviews.length > 0 && (
            <section>
              <h2 className="font-serif text-xl">Guest reviews</h2>
              <div className="mt-3 space-y-3">
                {j.reviews.map((r) => (
                  <Card key={`${r.author}-${r.date}`}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">
                        {r.title} — {r.rating}/5
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {r.author} · {r.date}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {hasSection(template, "documents") && <DocumentsSection j={j} />}
          {hasSection(template, "faqs") && <FaqSection j={j} />}

          {hasSection(template, "terms") && j.terms.length > 0 && (
            <section>
              <h2 className="font-serif text-xl">Booking terms</h2>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {j.terms.map((t) => (
                  <li key={t}>· {t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">From</p>
                <p className="font-serif text-3xl">{formatJourneyPrice(j)}</p>
                <p className="text-xs text-muted-foreground">per person, twin share</p>
              </div>
              {j.departures.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Departures
                  </p>
                  {j.departures.slice(0, 8).map((d) => (
                    <div key={d.date} className="flex items-center justify-between text-sm">
                      <span>{d.date}</span>
                      <span className="text-muted-foreground">
                        {d.availability}
                        {d.seatsRemaining != null ? ` · ${d.seatsRemaining} left` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <QuoteRequestDialog
                product={product}
                trigger={<Button className="w-full">{ctaLabel(template)}</Button>}
              />
              <Button asChild variant="outline" className="w-full">
                <Link
                  to="/concierge"
                  search={{
                    prompt: `${template.conciergePrompt} Journey: ${j.title} (${j.code}), ${j.durationDays} days in ${j.country}.`,
                  }}
                >
                  Ask the AI Concierge
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                Availability and final pricing confirmed by your specialist within 24 hours.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <h2 className="font-serif text-2xl">You may also consider</h2>
          <div className="mt-6">
            <JourneyGrid journeys={related} />
          </div>
        </section>
      )}
    </article>
  );
}
