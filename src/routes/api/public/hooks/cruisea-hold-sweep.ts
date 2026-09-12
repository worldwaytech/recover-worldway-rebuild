// Scheduled release of expired Cruisea cabin holds.
//
// Called by the database scheduler only. It reuses the existing inventory
// release mechanism via sweepExpiredCruiseaHolds — no booking, revalidation,
// hold or confirmation logic is duplicated or changed here.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function matches(header: string, secret: string): boolean {
  const value = secret.trim();
  if (!value) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorised(request: Request): boolean {
  const header = request.headers.get("x-cruisea-sweep-secret") ?? "";
  if (!header) return false;
  // Either the dedicated key or the shared hold-sweep key already held by the
  // database scheduler authorises the call.
  return (
    matches(header, process.env["CRUISEA_HOLD_SWEEP_SECRET"] ?? "") ||
    matches(header, process.env["CRYSTAL_HOLD_SWEEP_SECRET"] ?? "")
  );
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
