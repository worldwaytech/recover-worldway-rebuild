import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatJourneyPrice, nextDeparture, type Journey } from "@/lib/journeys";
import { mediaUrl } from "@/lib/media";

export function DemoNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground ${className}`}
    >
      <span className="font-medium text-foreground">Demonstration content.</span> Itineraries,
      pricing and departures shown are internal sample records used while official partner feeds are
      being authorised. Availability and final pricing are confirmed by a Worldway specialist before
      any booking.
    </p>
  );
}

export function JourneyCard({ journey }: { journey: Journey }) {
  const dep = nextDeparture(journey);
  return (
    <Card className="group overflow-hidden border-border/60">
      <Link to="/journeys/$code" params={{ code: journey.code }} className="block">
        <div className="relative h-52 overflow-hidden">
          <img
            src={mediaUrl(journey.media.hero)}
            alt={`${journey.title} — ${journey.country}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute left-3 top-3 flex gap-2">
            <Badge className="bg-background/90 text-foreground">{journey.partnerName}</Badge>
            {journey.dataSource === "demonstration" ? (
              <Badge variant="secondary">Sample</Badge>
            ) : null}
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {journey.country} · {journey.durationDays} days
          </p>
          <h3 className="font-serif text-lg leading-snug">{journey.title}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{journey.subtitle}</p>
          <div className="flex items-end justify-between pt-1">
            <span className="text-sm">
              <span className="text-muted-foreground">from </span>
              <span className="font-medium">{formatJourneyPrice(journey)}</span>
            </span>
            {dep ? <span className="text-xs text-muted-foreground">Next {dep.date}</span> : null}
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function JourneyGrid({ journeys, empty }: { journeys: Journey[]; empty?: string }) {
  if (journeys.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {empty ?? "No journeys published here yet — our specialists can design one for you."}
      </p>
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {journeys.map((j) => (
        <JourneyCard key={j.code} journey={j} />
      ))}
    </div>
  );
}
