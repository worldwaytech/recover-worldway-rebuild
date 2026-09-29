import { createFileRoute } from "@tanstack/react-router";
import { decodeMediaToken } from "@/lib/media";

const MAX_BYTES = 15 * 1024 * 1024;

function blockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true; // no raw IPs
  if (h.includes(":") || h.startsWith("[")) return true; // no IPv6 literals
  return false;
}

// Worldway media proxy: streams third-party images under a neutral URL.
// Images only; supplier headers are never forwarded to the browser.
export const Route = createFileRoute("/media/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const tok = String(params.token).slice(0, 4096);
        let raw: string | null;
        if (tok.startsWith("s.")) {
          const { unseal } = await import("@/lib/confidentiality/seal.server");
          const v = await unseal(tok.slice(2));
          raw = typeof v === "string" ? v : null;
        } else {
          raw = decodeMediaToken(tok);
        }
        let target: URL;
        try {
          target = new URL(raw ?? "");
        } catch {
          return new Response("Not found", { status: 404 });
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("Not found", { status: 404 });
        if (blockedHost(target.hostname)) return new Response("Not found", { status: 404 });
        try {
          const upstream = await fetch(target.toString(), {
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
              Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
            },
          });
          const type = upstream.headers.get("content-type") ?? "";
          const len = Number(upstream.headers.get("content-length") ?? 0);
          if (!upstream.ok || !upstream.body || !type.startsWith("image/") || len > MAX_BYTES) {
            return new Response("Image unavailable", { status: 404 });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Image unavailable", { status: 404 });
        }
      },
    },
  },
});
