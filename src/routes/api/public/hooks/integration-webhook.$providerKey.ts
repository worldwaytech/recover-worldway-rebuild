// Provider-agnostic webhook ingress. Every configured supplier receives a
// stable path; signatures are verified server-side before any sync is run.
import { createFileRoute } from "@tanstack/react-router";

// Bounded body: supplier notifications are small events, never bulk payloads.
const MAX_BODY_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/public/hooks/integration-webhook/$providerKey")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const declared = Number(request.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
          return Response.json({ accepted: false, reason: "payload too large" }, { status: 413 });
        }
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
          return Response.json({ accepted: false, reason: "payload too large" }, { status: 413 });
        }
        const signature =
          request.headers.get("x-webhook-signature") ??
          request.headers.get("x-signature") ??
          request.headers.get("x-hub-signature-256");
        const timestamp =
          request.headers.get("x-webhook-timestamp") ?? request.headers.get("x-timestamp");
        const { handleWebhook } = await import("@/lib/integrations/engine.server");
        const result = await handleWebhook(params.providerKey, rawBody, signature, timestamp);
        return Response.json(result, { status: result.accepted ? 202 : 401 });
      },
    },
  },
});
