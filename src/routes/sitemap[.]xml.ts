import { createFileRoute } from "@tanstack/react-router";
import { WORLD } from "@/lib/destinations";
import { allJourneys } from "@/lib/journeys";
import { collectionItems, collectionsMeta } from "@/lib/collections";
import { BROWSE_HUBS } from "@/lib/browse-hubs";
import { CRYSTAL_DESTINATIONS, CRYSTAL_SHIPS } from "@/lib/crystal/content";

const ORIGIN = "https://worldwaytravelsgroup.com";

const STATIC_PATHS = [
  "/",
  "/about",
  "/contact",
  "/help",
  "/trust",
  "/privacy",
  "/terms",
  "/cookies",
  "/search",
  "/concierge",
  "/journeys",
  "/destinations",
  "/tours",
  "/tours/browse",
  "/executive",
  "/membership",
  "/flights",
  "/hotels",
  "/private-jets",
  "/activities",
  "/buses",
  "/pre-purchased-flights",
  "/aircraft",
  "/products",
  "/b2b",
  "/b2c",
  "/agent",
  "/crystal-cruises",
  "/crystal-cruises/search",
  "/crystal-cruises/destinations",
  "/crystal-cruises/ships",
  "/crystal-cruises/quote",
];

function urls(): { loc: string; priority: string }[] {
  const out = STATIC_PATHS.map((p) => ({ loc: ORIGIN + p, priority: p === "/" ? "1.0" : "0.8" }));
  for (const d of CRYSTAL_DESTINATIONS) {
    out.push({ loc: `${ORIGIN}/crystal-cruises/destinations/${d.slug}`, priority: "0.7" });
  }
  for (const s of CRYSTAL_SHIPS) {
    out.push({ loc: `${ORIGIN}/crystal-cruises/ships/${s.slug}`, priority: "0.7" });
  }
  for (const h of BROWSE_HUBS) {
    out.push({ loc: `${ORIGIN}/tours/browse/${h.slug}`, priority: "0.8" });
  }
  for (const key of Object.keys(collectionsMeta)) {
    out.push({ loc: `${ORIGIN}/${key}`, priority: "0.7" });
    for (const item of collectionItems[key as keyof typeof collectionItems] ?? []) {
      out.push({ loc: `${ORIGIN}/${key}/${item.slug}`, priority: "0.6" });
    }
  }
  for (const region of WORLD) {
    out.push({ loc: `${ORIGIN}/destinations/${region.slug}`, priority: "0.7" });
    for (const country of region.countries) {
      out.push({ loc: `${ORIGIN}/destinations/${region.slug}/${country.slug}`, priority: "0.6" });
      for (const d of country.destinations) {
        out.push({
          loc: `${ORIGIN}/destinations/${region.slug}/${country.slug}/${d.slug}`,
          priority: "0.6",
        });
      }
    }
  }
  for (const j of allJourneys()) out.push({ loc: `${ORIGIN}/journeys/${j.code}`, priority: "0.6" });
  const seen = new Set<string>();
  return out.filter((u) => (seen.has(u.loc) ? false : (seen.add(u.loc), true)));
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const today = new Date().toISOString().slice(0, 10);
        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls()
            .map(
              (u) =>
                `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`,
            )
            .join("\n") +
          `\n</urlset>\n`;
        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
