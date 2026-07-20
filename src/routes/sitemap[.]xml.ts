import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { allCollections, collectionItems } from "@/lib/collections";
import { regions, journeys } from "@/lib/data";

const BASE_URL = "https://recover-worldway-rebuild.lovable.app";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const paths: string[] = [
          "/", "/destinations", "/journeys", "/about", "/contact", "/membership",
          "/blog", "/trip-builder", "/privacy", "/terms", "/cookies", "/trust", "/help", "/auth",
        ];
        for (const r of regions) paths.push(`/destinations/${r.slug}`);
        for (const j of journeys) paths.push(`/journeys/${j.slug}`);
        for (const c of allCollections) {
          paths.push(c.detailBasePath);
          for (const item of collectionItems[c.slug]) {
            paths.push(`${c.detailBasePath}/${item.slug}`);
          }
        }
        const unique = Array.from(new Set(paths));
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...unique.map((p) =>
            `  <url><loc>${BASE_URL}${p}</loc><changefreq>weekly</changefreq></url>`,
          ),
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
