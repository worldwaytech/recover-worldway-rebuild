// Scheduled incremental sync for the Tours Marketplace. Caller must present
// the existing integration schedule secret; no supplier credentials here.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function matches(supplied: string, secret: string): boolean {
  if (!secret || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/bokun-marketplace-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supplied = request.headers.get("x-integration-sync-secret") ?? "";
        const ok =
          matches(supplied, (process.env["INTEGRATION_SYNC_SECRET"] ?? "").trim()) ||
          matches(supplied, (process.env["INTEGRATION_SYNC_SCHEDULE_TOKEN"] ?? "").trim());
        if (!ok) return Response.json({ error: "unauthorised" }, { status: 401 });
        try {
          const { runMarketplaceSync } = await import("@/lib/bokun/sync.server");
          const r = await runMarketplaceSync({ scope: "incremental", trigger: "auto" });
          return Response.json({ ok: true, created: r.created, updated: r.updated, failed: r.failed });
        } catch {
          return Response.json({ ok: false, error: "sync failed" }, { status: 500 });
        }
      },
    },
  },
});
