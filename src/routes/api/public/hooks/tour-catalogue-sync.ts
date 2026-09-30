// Scheduled tour catalogue sync. Each call advances the current run for ~25s
// (resumable cursor); when no run is active it starts a new full daily refresh.
// Caller must present the existing integration schedule secret.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function matches(supplied: string, secret: string): boolean {
  if (!secret || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/tour-catalogue-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supplied = request.headers.get("x-integration-sync-secret") ?? "";
        const ok =
          matches(supplied, (process.env["INTEGRATION_SYNC_SECRET"] ?? "").trim()) ||
          matches(supplied, (process.env["INTEGRATION_SYNC_SCHEDULE_TOKEN"] ?? "").trim());
        if (!ok) return Response.json({ error: "unauthorised" }, { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { startRun, continueRun } = await import("@/lib/travelshop/sync.server");
          const db = supabaseAdmin as never;
          const { data: last } = await supabaseAdmin
            .from("travelshop_sync_runs").select("id, status, started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
          const running = last?.status === "running";
          const fresh = last && Date.now() - new Date(last.started_at).getTime() < 20 * 3600_000;
          if (!running && fresh) return Response.json({ ok: true, skipped: "daily refresh already done" });
          const id = await startRun(db, "scheduled", "full");
          const r = (await continueRun(db, id, Date.now() + 25_000)) as { status: string; next_page: number; pages_total: number | null };
          return Response.json({ ok: true, status: r.status, nextPage: r.next_page, pages: r.pages_total });
        } catch {
          return Response.json({ ok: false, error: "sync failed" }, { status: 500 });
        }
      },
    },
  },
});
