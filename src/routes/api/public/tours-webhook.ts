import { createFileRoute } from "@tanstack/react-router";

/**
 * Tour supplier (Sherpa / G Adventures REST) webhook receiver.
 * Configure this URL in the supplier dashboard and set TOURS_WEBHOOK_KEY to the
 * same shared secret. Payloads notify us that a resource changed so cached
 * catalogue reads can be invalidated.
 */
export const Route = createFileRoute("/api/public/tours-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["TOURS_WEBHOOK_KEY"];
        if (!expected) {
          return new Response("Webhook not configured", { status: 503 });
        }
        const provided =
          request.headers.get("x-webhook-key") ??
          request.headers.get("x-application-key") ??
          new URL(request.url).searchParams.get("key") ??
          "";
        if (provided.length !== expected.length || provided !== expected) {
          return new Response("Invalid webhook key", { status: 401 });
        }

        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const body = (payload ?? {}) as Record<string, unknown>;
        console.log("[tours-webhook]", {
          event: typeof body["event"] === "string" ? body["event"] : undefined,
          resource: typeof body["resource"] === "string" ? body["resource"] : undefined,
          id: body["id"] ?? body["object_id"] ?? null,
        });

        return Response.json({ received: true });
      },
      GET: async () =>
        Response.json({
          ok: true,
          endpoint: "tours-webhook",
          configured: Boolean(process.env["TOURS_WEBHOOK_KEY"]),
        }),
    },
  },
});
