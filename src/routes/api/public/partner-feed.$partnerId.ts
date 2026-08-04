// Authorised partner feed push endpoint.
//
// Partners who publish rather than serve their catalogue POST their licensed
// XML/JSON/CSV payload here. Every request must carry an HMAC-SHA256
// signature over the raw body, computed with the shared secret named in the
// connector's feed config. Unsigned or unknown callers are rejected before
// the payload is read as data.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function verify(signature: string | null, secret: string, body: string): boolean {
  if (!signature) return false;
  const provided = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export const Route = createFileRoute("/api/public/partner-feed/$partnerId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { getConnector } = await import("@/lib/partners/registry");
        const cfg = getConnector(String(params.partnerId).slice(0, 60));
        if (!cfg?.feed?.webhookSecret) return new Response("Unknown feed", { status: 404 });

        const secret = process.env[cfg.feed.webhookSecret];
        if (!secret) return new Response("Feed not activated", { status: 503 });

        const body = await request.text();
        if (body.length > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
        if (!verify(request.headers.get("x-worldway-signature"), secret, body))
          return new Response("Invalid signature", { status: 401 });

        try {
          const { parseFeedPayload } = await import("@/lib/partners/feeds.server");
          const { ingestFeedRecords } = await import("@/lib/partners/runtime.server");
          const records = parseFeedPayload(cfg.feed, body);
          const result = ingestFeedRecords(cfg, records);
          return Response.json({
            ok: true,
            partnerId: cfg.id,
            received: result.received,
            accepted: result.accepted,
            syncedAt: result.syncedAt,
          });
        } catch (err) {
          console.error(err);
          return new Response("Feed could not be parsed", { status: 422 });
        }
      },
    },
  },
});
