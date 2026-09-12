// Scheduled release of expired Cruisea cabin holds.
//
// Called by the database scheduler only. It reuses the existing inventory
// release mechanism via sweepExpiredCruiseaHolds — no booking, revalidation,
// hold or confirmation logic is duplicated or changed here.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function authorised(request: Request): boolean {
  const secret = (process.env["CRUISEA_HOLD_SWEEP_SECRET"] ?? "").trim();
  if (!secret) return false;
  const header = request.headers.get("x-cruisea-sweep-secret") ?? "";
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

export const Route = createFileRoute("/api/public/hooks/cruisea-hold-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) return jsonResponse({ error: "unauthorised" }, 401);
        try {
          const { sweepExpiredCruiseaHolds } = await import("@/lib/cruisea/booking.server");
          const result = await sweepExpiredCruiseaHolds();
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
