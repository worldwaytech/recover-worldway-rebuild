import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { PageShell } from "@/components/search-shell";
import { CruiseaSailingDetailView } from "@/components/cruisea/cruisea-sailing-detail";
import { getCruiseaSailingFn } from "@/lib/cruisea/cruisea.functions";
import type { CruiseaSailingDetail } from "@/lib/cruisea/types";

const searchSchema = z.object({ guests: z.coerce.number().int().min(1).max(8).optional() });

export const Route = createFileRoute("/voyages/cruisea/sailing/$id")({
  validateSearch: searchSchema,
  loader: async ({ params }) => {
    const sailing = (await getCruiseaSailingFn({
      data: { id: params.id },
    })) as CruiseaSailingDetail | null;
    if (!sailing) throw notFound();
    return sailing;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.title} — ${loaderData.shipName} | Cruisea Voyages`
          : "Cruisea voyage | Worldway",
      },
      {
        name: "description",
        content: loaderData
          ? `${loaderData.durationNights}-night ${loaderData.cruiseType.toLowerCase()} voyage aboard ${loaderData.shipName} from ${loaderData.embarkationPort} to ${loaderData.disembarkationPort}. Live cabin availability and holds.`
          : "Cruisea voyage details, cabins and live availability.",
      },
      {
        property: "og:title",
        content: loaderData ? `${loaderData.title} — Cruisea` : "Cruisea voyage",
      },
      {
        property: "og:description",
        content: loaderData
          ? `${loaderData.cruiseLine} · ${loaderData.shipName} · ${loaderData.durationNights} nights`
          : "Cruisea voyage details and cabins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-serif text-3xl">This voyage could not be loaded</h1>
      </div>
    </PageShell>
  ),
  notFoundComponent: () => (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-serif text-3xl">Voyage not found</h1>
      </div>
    </PageShell>
  ),
  component: CruiseaSailingPage,
});

function CruiseaSailingPage() {
  const sailing = Route.useLoaderData();
  const { guests } = Route.useSearch();
  return (
    <PageShell>
      <CruiseaSailingDetailView sailing={sailing} initialGuests={guests ?? 2} />
    </PageShell>
  );
}
