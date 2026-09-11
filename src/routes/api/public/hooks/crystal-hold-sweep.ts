// Scheduled release of expired Crystal suite holds.
//
// Called by the database scheduler only. It reuses the existing, verified
// release mechanism (documented DELETE /v1/Bookings/suites) via
// sweepExpiredCrystalHolds — no booking, revalidation, hold, suite or
// confirmation logic is duplicated or changed here.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function authorised(request: Request): boolean {
  const secret = (process.env["CRYSTAL_HOLD_SWEEP_SECRET"] ?? "").trim();
  if (!secret) return false;
  const header = request.headers.get("x-crystal-sweep-secret") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/crystal-hold-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) {
          return jsonResponse({ error: "unauthorised" }, 401);
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sweepExpiredCrystalHolds } = await import("@/lib/crystal/booking.server");
        try {
          const result = await sweepExpiredCrystalHolds(supabaseAdmin);
          return jsonResponse({ ok: true, ...result });
        } catch (err) {
          return jsonResponse(
            { ok: false, error: err instanceof Error ? err.message : "sweep failed" },
            500,
          );
        }
      },
    },
  },
});
