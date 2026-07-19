import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type Journey,
  type Availability,
  availabilityColors,
  formatPrice,
  formatJourneyTitle,
} from "@/lib/data";

export function AvailabilityBadge({ status }: { status: Availability }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[0.65rem] uppercase tracking-wider ${availabilityColors[status]}`}
    >
      {status}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <Heading className="font-serif text-4xl leading-tight md:text-5xl">{title}</Heading>
      {intro && <p className="mt-4 text-muted-foreground">{intro}</p>}
    </div>
  );
}

export function JourneyCard({
  journey,
  onViewJourney,
  expanded = false,
}: {
  journey: Journey;
  onViewJourney?: (journey: Journey) => void;
  expanded?: boolean;
}) {
  const journeyTitle = formatJourneyTitle(journey.slug, journey.title);

  return (
    <article className="group flex flex-col overflow-hidden rounded-sm border border-border bg-card shadow-soft transition-shadow hover:shadow-elegant">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Link to="/journeys/$slug" params={{ slug: journey.slug }} className="block h-full">
          <img
            src={journey.image}
            alt={journeyTitle}
            width={800}
            height={600}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </Link>
        <div className="absolute left-3 top-3 flex gap-2">
          {journey.bestseller && (
            <span className="rounded-sm bg-gold px-2.5 py-1 text-[0.6rem] uppercase tracking-wider text-gold-foreground">
              Best Seller
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3">
          <AvailabilityBadge status={journey.availability} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {journey.destination}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {journey.duration} days
          </span>
        </div>
        <Link to="/journeys/$slug" params={{ slug: journey.slug }} className="mt-2 block">
          <h3 className="font-serif text-xl leading-snug group-hover:text-gold">{journeyTitle}</h3>
        </Link>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">{journey.overview}</p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm font-medium">{formatPrice(journey.priceFrom)}</span>
          {onViewJourney ? (
            <Button
              type="button"
              variant={expanded ? "outline-ink" : "gold"}
              size="sm"
              aria-expanded={expanded}
              onClick={() => onViewJourney(journey)}
            >
              {expanded ? "Hide Details" : "View Journey"}
            </Button>
          ) : (
            <Link
              to="/journeys/$slug"
              params={{ slug: journey.slug }}
              className="text-xs uppercase tracking-widest text-gold"
            >
              View Journey →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < rating ? "fill-gold text-gold" : "text-border"}`} />
      ))}
    </div>
  );
}
