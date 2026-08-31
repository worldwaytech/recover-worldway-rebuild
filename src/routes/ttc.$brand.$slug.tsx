import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageShell } from "@/components/search-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTtcTourDetail } from "@/lib/ttc/ttc.functions";
import type { TtcAccommodation, TtcDeparture, TtcItineraryDay, TtcTourDetail } from "@/lib/ttc/types";

export const Route = createFileRoute("/ttc/$brand/$slug")({
  loader: async ({ params }) => {
    const tour = (await getTtcTourDetail({
      data: { brand: params.brand, slug: params.slug },
    })) as TtcTourDetail | null;
    if (!tour) throw notFound();
    return { tour };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Journey unavailable — Worldway Travels Group" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { tour } = loaderData as { tour: TtcTourDetail };
    const title = `${tour.name} — ${tour.brandLabel ?? "TTC"} | Worldway`;
    const description = (
      tour.summary ??
      tour.description ??
      `${tour.name}: a ${tour.durationDays ?? ""}-day guided journey from ${tour.brandLabel ?? "TTC"}.`
    ).slice(0, 155);
    const image = tour.heroImage && tour.heroImage.startsWith("https://") ? tour.heroImage : null;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
    };
  },
  component: TtcTourPage,
});

function money(amount: number | null, currency: string | null) {
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${Math.round(amount)}`.trim();
  }
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TtcTourPage() {
  const { tour } = Route.useLoaderData() as { tour: TtcTourDetail };
  const itinerary = tour.itinerary as unknown as TtcItineraryDay[];
  const accommodation = tour.accommodation as unknown as TtcAccommodation[];
  const departures = tour.departures as unknown as TtcDeparture[];

  return (
    <PageShell>
      <nav className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <Link to="/ttc" className="hover:text-primary">
          TTC Collection
        </Link>
        <span className="px-2">/</span>
        <span>{tour.brandLabel ?? tour.brand}</span>
      </nav>

      <header className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Badge variant="outline">{tour.brandLabel ?? tour.brand}</Badge>
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{tour.name}</h1>
          {tour.subtitle ? <p className="text-sm text-muted-foreground">{tour.subtitle}</p> : null}
          {tour.summary ? <p className="text-lg text-muted-foreground">{tour.summary}</p> : null}
          {tour.description ? <p className="text-sm leading-relaxed">{tour.description}</p> : null}
          <dl className="grid gap-4 pt-2 text-sm sm:grid-cols-3">
            {tour.durationDays ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Duration</dt>
                <dd>
                  {tour.durationDays} days
                  {tour.durationNights ? ` / ${tour.durationNights} nights` : ""}
                </dd>
              </div>
            ) : null}
            {tour.startCity ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Route</dt>
                <dd>
                  {tour.startCity}
                  {tour.endCity && tour.endCity !== tour.startCity ? ` → ${tour.endCity}` : ""}
                </dd>
              </div>
            ) : null}
            {tour.groupSizeMax ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Group size</dt>
                <dd>Up to {tour.groupSizeMax} guests</dd>
              </div>
            ) : null}
            {tour.supplierTourId ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">TTC code</dt>
                <dd>{tour.supplierTourId}</dd>
              </div>
            ) : null}
            {tour.countries.length ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Countries</dt>
                <dd>{tour.countries.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <aside className="space-y-4 rounded-2xl border border-border bg-card p-6">
          {tour.heroImage ? (
            <img
              src={tour.heroImage}
              alt={`${tour.name} guided journey`}
              className="aspect-[4/3] w-full rounded-xl object-cover"
            />
          ) : null}
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">From</p>
          <p className="text-2xl font-semibold">
            {money(tour.priceFrom, tour.priceCurrency) ?? "Price on request"}
          </p>
          {tour.priceNote ? <p className="text-xs text-muted-foreground">{tour.priceNote}</p> : null}
          <p className="text-xs text-muted-foreground">
            Lead-in price as published by {tour.brandLabel ?? "TTC"}. Live availability and revalidated
            pricing activate once TTC API access is granted to our account; until then our team confirms
            every departure directly with the operator.
          </p>
          <Button asChild className="w-full">
            <Link to="/contact" search={{ subject: `TTC — ${tour.name}` } as never}>
              Request this journey
            </Link>
          </Button>
          <a
            href={tour.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
            className="block text-center text-xs text-muted-foreground underline"
          >
            View the operator page
          </a>
        </aside>
      </header>

      {tour.highlights.length ? <List title="Journey highlights" items={tour.highlights} /> : null}

      {itinerary.length ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Day-by-day itinerary</h2>
          <ol className="space-y-4">
            {itinerary.map((day, index) => (
              <li key={`${day.day ?? index}-${day.title ?? index}`} className="rounded-xl border border-border p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Day {day.day ?? index + 1}
                </p>
                {day.title ? <h3 className="mt-1 font-semibold">{day.title}</h3> : null}
                {day.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">{day.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {[
                    day.accommodation ? `Hotel: ${day.accommodation}` : null,
                    day.meals.length ? `Meals: ${day.meals.join(", ")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <List title="What's included" items={tour.inclusions} />
        <List title="Not included" items={tour.exclusions} />
        <List title="Meals" items={tour.meals} />
        <List title="Transport" items={tour.transport} />
      </div>

      {accommodation.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accommodation</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {accommodation.map((hotel, index) => (
                <li key={`${hotel.name ?? index}`}>
                  <span className="text-foreground">{hotel.name ?? "Hotel to be confirmed"}</span>
                  {hotel.city ? ` — ${hotel.city}` : ""}
                  {hotel.nights ? ` (${hotel.nights} night${hotel.nights > 1 ? "s" : ""})` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {departures.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Published departures</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <th className="py-2">Departs</th>
                  <th className="py-2">Returns</th>
                  <th className="py-2">From</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {departures.slice(0, 40).map((departure, index) => (
                  <tr key={`${departure.startDate ?? index}`} className="border-t border-border">
                    <td className="py-2">{departure.startDate ?? "—"}</td>
                    <td className="py-2">{departure.endDate ?? "—"}</td>
                    <td className="py-2">
                      {money(departure.price, departure.currency ?? tour.priceCurrency) ?? "—"}
                    </td>
                    <td className="py-2">{departure.availability ?? "On request"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {tour.images.length > 1 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Gallery</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {tour.images.slice(1, 10).map((image) => (
              <img
                key={image}
                src={image}
                alt={`${tour.name} photography`}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Source: {tour.brandLabel ?? tour.brand} official publication ({tour.sourceUrl}). Last
        synchronised {new Date(tour.syncedAt).toLocaleDateString()}.
      </p>
    </PageShell>
  );
}
