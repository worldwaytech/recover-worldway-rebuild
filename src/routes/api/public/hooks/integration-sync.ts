// Single scheduled entry point for every auto-sync-enabled supplier.
// The existing engine enforces global/provider switches, due intervals,
// idempotency and replay safety. No supplier credentials reach this route.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function authorised(request: Request): boolean {
  const secret = (process.env["INTEGRATION_SYNC_SECRET"] ?? "").trim();
  const supplied = request.headers.get("x-integration-sync-secret") ?? "";
  if (!secret || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/integration-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
        try {
          const { syncAllProviders } = await import("@/lib/integrations/engine.server");
          const results = await syncAllProviders({
            scope: "incremental",
            trigger: "auto",
            onlyDue: true,
          });
          return Response.json({ ok: true, processed: results.length, results });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "sync failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});