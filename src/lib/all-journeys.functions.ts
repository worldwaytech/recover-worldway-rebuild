import { createServerFn } from "@tanstack/react-start";
import type { Journey } from "@/lib/data";

// Journey marketing content is served from the server (not bundled into the
// browser) so the privacy middleware can neutralise operator names, source
// links and supplier image hosts before anything reaches a visitor.
async function load(): Promise<Journey[]> {
  const { journeys } = await import("@/lib/all-journeys-content");
  return journeys;
}

export const getStaticJourneys = createServerFn({ method: "GET" }).handler(async () => {
  return { journeys: await load() };
});

export const getStaticJourney = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => ({ slug: String(d?.slug ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const all = await load();
    const journey = all.find((j) => j.slug === data.slug) ?? null;
    const related = journey
      ? all
          .filter((j) => j.slug !== journey.slug && (j.region === journey.region || j.category === journey.category))
          .slice(0, 3)
      : [];
    return { journey, related };
  });
