// Provider-agnostic webhook ingress. Every configured supplier receives a
// stable path; signatures are verified server-side before any sync is run.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/integration-webhook/$providerKey")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const rawBody = await request.text();
        const signature =
          request.headers.get("x-webhook-signature") ??
          request.headers.get("x-signature") ??
          request.headers.get("x-hub-signature-256");
        const { handleWebhook } = await import("@/lib/integrations/engine.server");
        const result = await handleWebhook(params.providerKey, rawBody, signature);
        return Response.json(result, { status: result.accepted ? 202 : 401 });
      },
    },
  },
});