import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JourneyGrid, DemoNotice } from "@/components/partners/journey-ui";
import { allJourneys, filterJourneys, journeyPartners } from "@/lib/journeys";
import { allRegions } from "@/lib/destinations";
import { VERTICAL_TEMPLATES, templateForKind } from "@/lib/partners/templates";

export const Route = createFileRoute("/journeys/")({
  head: () => {
    const title = "Luxury Journeys — Worldway Travels Group";
    const description =
      "Curated journeys from the world's finest travel partners — Abercrombie & Kent, Crystal Cruises and more — searchable by destination, partner and interest.";
    const url = "https://worldwaytravelsgroup.com/journeys";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: JourneysIndex,
});

function JourneysIndex() {
  const [q, setQ] = useState("");
  const [partner, setPartner] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [vertical, setVertical] = useState<string>("");
  const partners = useMemo(() => journeyPartners(), []);
  const regions = useMemo(() => allRegions(), []);
  const verticals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of allJourneys()) {
      const id = j.templateId ?? templateForKind(j.collectionKind).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return VERTICAL_TEMPLATES.map((t) => ({ ...t, count: counts.get(t.id) ?? 0 })).filter(
      (t) => t.count > 0,
    );
  }, []);
  const results = useMemo(
    () =>
      filterJourneys({
        q: q || undefined,
        partnerId: partner || undefined,
        region: region || undefined,
      }).filter(
        (j) => !vertical || (j.templateId ?? templateForKind(j.collectionKind).id) === vertical,
      ),
    [q, partner, region, vertical],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-14">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        Partner journeys
      </p>
      <h1 className="mt-2 font-serif text-4xl">Journeys from the world's finest operators</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        {allJourneys().length} curated itineraries across {regions.length} regions, each arranged
        with a vetted luxury partner and supported end to end by a Worldway specialist.
      </p>
      <DemoNotice className="mt-5 max-w-3xl" />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search journeys, countries, ships or hotels"
          className="max-w-sm"
          aria-label="Search journeys"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={partner ? "outline" : "secondary"}
            onClick={() => setPartner("")}
          >
            All partners
          </Button>
          {partners.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={partner === p.id ? "secondary" : "outline"}
              onClick={() => setPartner(p.id)}
            >
              {p.name}{" "}
              <Badge variant="outline" className="ml-2">
                {p.count}
              </Badge>
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={region ? "outline" : "secondary"} onClick={() => setRegion("")}>
          All regions
        </Button>
        {regions.map((r) => (
          <Button
            key={r.slug}
            size="sm"
            variant={region === r.slug ? "secondary" : "outline"}
            onClick={() => setRegion(r.slug)}
          >
            {r.name}
          </Button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={vertical ? "outline" : "secondary"}
          onClick={() => setVertical("")}
        >
          All collections
        </Button>
        {verticals.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={vertical === t.id ? "secondary" : "outline"}
            onClick={() => setVertical(t.id)}
          >
            {t.label}
            <Badge variant="outline" className="ml-2">
              {t.count}
            </Badge>
          </Button>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">{results.length} journeys</p>
      <div className="mt-4">
        <JourneyGrid journeys={results} />
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Browsing by place instead?{" "}
        <Link to="/destinations" className="underline underline-offset-4">
          Explore destinations
        </Link>
      </p>
    </div>
  );
}
