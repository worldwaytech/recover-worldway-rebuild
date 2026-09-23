// Scheduled refresh of transfer content (airports, ports, stations, hotels).
// Called by the database scheduler only, authorised by the shared scheduler key.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function authorised(request: Request): boolean {
  const secret = (process.env["CRYSTAL_HOLD_SWEEP_SECRET"] ?? "").trim();
  const header = request.headers.get("x-hbx-refresh-secret") ?? "";
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/hbx-transfers-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
        try {
          const { syncHbxTransfers } = await import("@/lib/hbx/ingest.server");
          const r = await syncHbxTransfers({});
          return Response.json({ ok: r.status !== "failed", status: r.status, received: r.received, written: r.written });
        } catch {
          return Response.json({ ok: false, error: "refresh failed" }, { status: 500 });
        }
      },
    },
  },
});
