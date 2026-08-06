import { createFileRoute } from "@tanstack/react-router";

// Supplier CDNs (TBO / UP17) reject browser-originated image requests with 403,
// so the app streams them through this proxy with a plain user agent.
const ALLOWED_HOSTS = new Set([
  "www.tboholidays.com",
  "tboholidays.com",
  "images.tboholidays.com",
  "travelapi.up17.in",
  "www.up17.in",
  "up17.in",
]);

export const Route = createFileRoute("/api/public/supplier-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("url");
        if (!raw) return new Response("Missing url", { status: 400 });

        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }
        if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
          return new Response("Host not allowed", { status: 403 });
        }

        try {
          const upstream = await fetch(target.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
              Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
            },
          });
          if (!upstream.ok || !upstream.body) {
            return new Response("Upstream image unavailable", { status: 502 });
          }
          const type = upstream.headers.get("content-type") ?? "image/jpeg";
          if (!type.startsWith("image/")) {
            return new Response("Not an image", { status: 502 });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
            },
          });
        } catch {
          return new Response("Image fetch failed", { status: 502 });
        }
      },
    },
  },
});
