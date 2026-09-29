/**
 * GLREP Enterprise Presentation Layer — Journey Experience.
 *
 * Additive renderer that turns a Journey Content Domain document into a premium
 * dark-luxury page. Consumes the content domain through adapters/registries
 * only — no hardcoded content, no modification of GLREP/TPMP/RBOP/booking.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  type ContentRegistries,
  type JourneyRecord,
  assembleRegistries,
} from "@/lib/train-tours/glrep/content";
import { mediaUrl } from "@/lib/media";

/** Shared registries instance (built once). */
let cached: ContentRegistries | null = null;
export const getContentRegistries = (): ContentRegistries => {
  if (!cached) cached = assembleRegistries();
  return cached;
};

const mediaUrl = (r: ContentRegistries, assetId: string): string => {
  const found = r.media.get(assetId);
  return found.ok ? found.value.url : "";
};

interface SectionDef {
  readonly id: string;
  readonly label: string;
  readonly render: () => boolean;
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 py-16 first:pt-0">
      <h2 className="mb-8 font-serif text-3xl text-foreground md:text-4xl">{title}</h2>
      {children}
    </section>
  );
}

function ProgressiveImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
      <img
        src={mediaUrl(src)}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`size-full object-cover transition-opacity duration-700 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/** Sticky section navigation with progress + deep-linking + mobile drawer. */
function JourneyNav({ sections }: { sections: readonly SectionDef[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      {/* Desktop sticky rail */}
      <nav
        aria-label="Journey sections"
        className="sticky top-24 hidden max-h-[80vh] overflow-y-auto pr-4 lg:block"
      >
        <ul className="space-y-1 border-l border-border">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors ${
                  active === s.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile drawer trigger */}
      <div className="sticky top-20 z-30 lg:hidden">
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-label="Toggle section navigation"
          onClick={() => setOpen((v) => !v)}
        >
          Sections
        </Button>
        {open && (
          <ul className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function JourneyExperience({ journey }: { journey: JourneyRecord }) {
  const r = getContentRegistries();
  const j = journey;

  const operator = r.operators.get(j.operatorId);
  const train = r.trains.get(j.trainId);
  const cabins = j.cabinIds.map((id) => r.cabins.get(id)).filter((c) => c.ok);

  const sections = useMemo<SectionDef[]>(() => {
    const defs: SectionDef[] = [
      { id: "overview", label: "Overview", render: () => true },
      { id: "highlights", label: "Highlights", render: () => j.highlights.length > 0 },
      { id: "itinerary", label: "Itinerary", render: () => j.itinerary.length > 0 },
      { id: "train", label: "The Train", render: () => train.ok },
      { id: "cabins", label: "Cabins", render: () => cabins.length > 0 },
      { id: "onboard", label: "On Board", render: () => true },
      { id: "dining", label: "Dining", render: () => j.diningIds.length > 0 },
      { id: "destinations", label: "Destinations", render: () => j.destinationIds.length > 0 },
      { id: "unesco", label: "UNESCO", render: () => j.unescoSiteIds.length > 0 },
      { id: "departures", label: "Departures", render: () => true },
      { id: "practical", label: "Travel Info", render: () => true },
      { id: "gallery", label: "Gallery", render: () => j.galleryIds.length > 0 },
      { id: "faqs", label: "FAQs", render: () => j.faqs.length > 0 },
      { id: "reviews", label: "Reviews", render: () => j.reviewIds.length > 0 },
      { id: "operator", label: "Operator", render: () => operator.ok },
    ];
    return defs.filter((d) => d.render());
  }, [j, train.ok, operator.ok, cabins.length]);

  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <header className="relative flex min-h-[70vh] items-end overflow-hidden">
        <img
          src={mediaUrl(r, j.hero.media.assetId)}
          alt={j.hero.media.alt}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="container-lux relative z-10 pb-16">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
            <Link to="/rail" className="hover:text-foreground">
              Train Tours
            </Link>
            <span className="mx-2">/</span>
            <span className="capitalize">{j.destinationSlug}</span>
          </nav>
          <h1 className="max-w-3xl font-serif text-4xl text-foreground md:text-6xl">
            {j.hero.headline}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{j.hero.subheadline}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Badge variant="secondary">{j.overview.durationDays} days</Badge>
            <Badge variant="secondary">
              {j.overview.fromCity} → {j.overview.toCity}
            </Badge>
          </div>
          <Button className="mt-8" size="lg" asChild>
            <a href="#departures">{j.hero.ctaLabel ?? "Enquire"}</a>
          </Button>
        </div>
      </header>

      <div className="container-lux grid grid-cols-1 gap-10 py-12 lg:grid-cols-[200px_1fr]">
        <JourneyNav sections={sections} />

        <main className="min-w-0">
          <Section id="overview" title="Journey Overview">
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
              {j.overview.body}
            </p>
          </Section>

          {j.highlights.length > 0 && (
            <Section id="highlights" title="Journey Highlights">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {j.highlights.map((h) => (
                  <Card key={h.title}>
                    <CardHeader>
                      <CardTitle className="text-lg">{h.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-muted-foreground">{h.description}</CardContent>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {j.itinerary.length > 0 && (
            <Section id="itinerary" title="Day-by-Day Itinerary">
              <Accordion type="single" collapsible className="w-full">
                {j.itinerary.map((d) => (
                  <AccordionItem key={d.day} value={`day-${d.day}`}>
                    <AccordionTrigger className="text-left">{d.title}</AccordionTrigger>
                    <AccordionContent>
                      <p className="text-muted-foreground">{d.description}</p>
                      {d.meals.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {d.meals.map((m) => (
                            <Badge key={m} variant="outline" className="capitalize">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Section>
          )}

          {train.ok && (
            <Section id="train" title="The Train">
              <p className="mb-6 max-w-3xl text-muted-foreground">{train.value.description}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {train.value.technicalSpecs.map((s) => (
                  <div key={s.label} className="rounded-lg border border-border p-4">
                    <div className="text-sm text-muted-foreground">{s.label}</div>
                    <div className="text-lg font-medium">{s.value}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {cabins.length > 0 && (
            <Section id="cabins" title="Cabins & Suites">
              <div className="grid gap-6 sm:grid-cols-2">
                {cabins.map((c) =>
                  c.ok ? (
                    <Card key={c.value.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          {c.value.name}
                          <Badge variant="secondary" className="capitalize">
                            {c.value.cabinClass}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-muted-foreground">
                        <p>{c.value.description}</p>
                        <p className="text-sm">Sleeps up to {c.value.maxOccupancy}</p>
                        <ul className="flex flex-wrap gap-2">
                          {c.value.amenities.map((a) => (
                            <li key={a}>
                              <Badge variant="outline">{a}</Badge>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ) : null,
                )}
              </div>
            </Section>
          )}

          <Section id="onboard" title="On Board">
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                ["Observation Cars", j.observationCars],
                ["Lounge Cars", j.loungeCars],
                ["Dining Cars", j.diningCars],
                ["Wellness", j.wellnessFacilities],
              ].map(([label, items]) => (
                <Card key={label as string}>
                  <CardHeader>
                    <CardTitle className="text-lg">{label as string}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-muted-foreground">
                    {(items as { name: string; description: string }[]).map((f) => (
                      <div key={f.name}>
                        <span className="font-medium text-foreground">{f.name}: </span>
                        {f.description}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium">Included</h3>
                <ul className="space-y-1 text-muted-foreground">
                  {j.includedServices.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium">Optional Experiences</h3>
                <ul className="space-y-1 text-muted-foreground">
                  {j.optionalExperiences.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {j.diningIds.length > 0 && (
            <Section id="dining" title="Dining Experience">
              <div className="grid gap-6 sm:grid-cols-2">
                {j.diningIds.map((id) => {
                  const d = r.dining.get(id);
                  return d.ok ? (
                    <Card key={id}>
                      <CardHeader>
                        <CardTitle className="text-lg">{d.value.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-muted-foreground">
                        {d.value.description}
                      </CardContent>
                    </Card>
                  ) : null;
                })}
              </div>
            </Section>
          )}

          {j.destinationIds.length > 0 && (
            <Section id="destinations" title="Destinations">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {j.destinationIds.map((id) => {
                  const d = r.destinations.get(id);
                  return d.ok ? (
                    <Card key={id}>
                      <CardHeader>
                        <CardTitle className="text-lg">{d.value.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-muted-foreground">
                        {d.value.description}
                      </CardContent>
                    </Card>
                  ) : null;
                })}
              </div>
            </Section>
          )}

          {j.unescoSiteIds.length > 0 && (
            <Section id="unesco" title="UNESCO World Heritage">
              <div className="grid gap-6 sm:grid-cols-2">
                {j.unescoSiteIds.map((id) => {
                  const u = r.unescoSites.get(id);
                  return u.ok ? (
                    <Card key={id}>
                      <CardHeader>
                        <CardTitle className="text-lg">{u.value.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-muted-foreground">
                        {u.value.description}
                      </CardContent>
                    </Card>
                  ) : null;
                })}
              </div>
            </Section>
          )}

          <Section id="departures" title="Departures & Booking">
            <Card>
              <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-sm text-muted-foreground">First departure</div>
                  <div className="font-medium">{j.departureCalendar.firstDeparture}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Last departure</div>
                  <div className="font-medium">{j.departureCalendar.lastDeparture}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Frequency</div>
                  <div className="font-medium">{j.departureCalendar.frequency}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Departures</div>
                  <div className="font-medium">{j.departureCalendar.departureCount}</div>
                </div>
              </CardContent>
            </Card>
            <Button className="mt-6" size="lg" asChild>
              <Link to="/contact">Request a quote</Link>
            </Button>
          </Section>

          <Section id="practical" title="Travel Information">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Seasons & Climate</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-muted-foreground">
                  <p>{j.practical.travelSeasons.join(", ")}</p>
                  <p>{j.practical.climate}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Visa</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  {j.practical.visaRequirements}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Packing Guide</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-muted-foreground">
                    {j.practical.packingGuide.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Accessibility & Sustainability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-muted-foreground">
                  <p>{j.practical.accessibility}</p>
                  <p>{j.practical.sustainability}</p>
                </CardContent>
              </Card>
            </div>
          </Section>

          {j.galleryIds.length > 0 && (
            <Section id="gallery" title="Gallery">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {j.galleryIds.map((id) => {
                  const url = mediaUrl(r, id);
                  return (
                    <Dialog key={id}>
                      <DialogTrigger asChild>
                        <button type="button" className="text-left" aria-label="Open image">
                          <ProgressiveImage src={url} alt={`${j.name} gallery image`} />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl">
                        <img
                          src={mediaUrl(url)}
                          alt={`${j.name} gallery image`}
                          className="w-full rounded-lg"
                        />
                      </DialogContent>
                    </Dialog>
                  );
                })}
              </div>
            </Section>
          )}

          {j.faqs.length > 0 && (
            <Section id="faqs" title="Frequently Asked Questions">
              <Accordion type="single" collapsible className="w-full">
                {j.faqs.map((f, i) => (
                  <AccordionItem key={f.question} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left">{f.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {f.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Section>
          )}

          {j.reviewIds.length > 0 && (
            <Section id="reviews" title="Guest Reviews">
              <div className="grid gap-6 sm:grid-cols-2">
                {j.reviewIds.map((id) => {
                  const rev = r.reviews.get(id);
                  return rev.ok ? (
                    <Card key={id}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-lg">
                          {rev.value.title ?? rev.value.author}
                          <span aria-label={`${rev.value.rating} out of 5`}>
                            {"★".repeat(rev.value.rating)}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-muted-foreground">
                        <p>{rev.value.body}</p>
                        <p className="mt-2 text-sm">— {rev.value.author}</p>
                      </CardContent>
                    </Card>
                  ) : null;
                })}
              </div>
            </Section>
          )}

          {operator.ok && (
            <Section id="operator" title="Operator">
              <Card>
                <CardHeader>
                  <CardTitle>{operator.value.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  {operator.value.description}
                </CardContent>
              </Card>
            </Section>
          )}
        </main>
      </div>
    </div>
  );
}
