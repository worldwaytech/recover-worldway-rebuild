// Scheduled live price/availability recheck for recent trip proposals.
// Bounded per run (max journeys + max partner checks) so partner rate limits are
// respected; it never books, pays or changes a journey — it only refreshes the
// recheck status staff and customers see. Caller must present the schedule secret.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function matches(supplied: string, secret: string): boolean {
  if (!secret || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/intel-recheck")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supplied = request.headers.get("x-integration-sync-secret") ?? "";
        const ok =
          matches(supplied, (process.env["INTEGRATION_SYNC_SECRET"] ?? "").trim()) ||
          matches(supplied, (process.env["INTEGRATION_SYNC_SCHEDULE_TOKEN"] ?? "").trim());
        if (!ok) return Response.json({ error: "unauthorised" }, { status: 401 });
        try {
          const { runScheduledRecheck } = await import("@/lib/engine/intelligence/intel.server");
          return Response.json({ ok: true, ...(await runScheduledRecheck()) });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "recheck failed" }, { status: 500 });
        }
      },
    },
  },
});
