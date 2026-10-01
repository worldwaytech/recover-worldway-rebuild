import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getRegion, countRegion, journeysForRegion, type RegionNode } from "@/lib/destinations";
import { JourneyGrid, DemoNotice } from "@/components/partners/journey-ui";
import type { Journey } from "@/lib/journeys";
import { Button } from "@/components/ui/button";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/destinations/$region/")({
  loader: ({ params }) => {
    const region = getRegion(params.region);
    if (!region) throw notFound();
    return { region, journeys: journeysForRegion(region.slug) };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [{ title: "Region unavailable — Worldway" }, { name: "robots", content: "noindex" }],
      };
    const r = loaderData.region;
    const title = `${r.headline} — Luxury Travel | Worldway Travels Group`;
    const description = r.intro.slice(0, 155);
    const url = `https://worldwaytravelsgroup.com/destinations/${r.slug}`;
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
  notFoundComponent: MissingNotFound,
  errorComponent: MissingError,
  component: RegionPage,
});

function MissingError() {
  return <UnavailableScreen />;
}

function MissingNotFound() {
  return <UnavailableScreen />;
}

function UnavailableScreen() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Region unavailable</h1>
      <Button asChild className="mt-6">
        <Link to="/destinations">All destinations</Link>
      </Button>
    </div>
  );
}

function RegionPage() {
  const { region: r, journeys } = Route.useLoaderData() as {
    region: RegionNode;
    journeys: Journey[];
  };
  const counts = countRegion(r);
  return (
    <div>
      <header className="relative h-[42vh] min-h-[300px] overflow-hidden">
        <img src={mediaUrl(r.heroImage)} alt={`${r.name} travel`} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-6xl px-4 pb-8">
          <nav className="text-xs text-muted-foreground">
            <Link to="/destinations" className="underline underline-offset-4">
              Destinations
            </Link>{" "}
            / {r.name}
          </nav>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">{r.headline}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="max-w-3xl text-muted-foreground">{r.intro}</p>
        <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          {counts.countries} countries · {counts.destinations} destinations · {counts.journeys}{" "}
          journeys
        </p>
        <DemoNotice className="mt-5 max-w-3xl" />

        <h2 className="mt-12 font-serif text-2xl">Countries</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {r.countries.map((c) => (
            <Link
              key={c.slug}
              to="/destinations/$region/$country"
              params={{ region: r.slug, country: c.slug }}
              className="rounded-lg border border-border/60 p-5 transition-colors hover:border-primary/50"
            >
              <h3 className="font-serif text-xl">{c.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.blurb}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {c.destinations.map((d) => d.name).join(" · ")}
              </p>
            </Link>
          ))}
        </div>

        <h2 className="mt-14 font-serif text-2xl">Journeys in {r.name}</h2>
        <div className="mt-5">
          <JourneyGrid journeys={journeys} />
        </div>
      </div>
    </div>
  );
}
