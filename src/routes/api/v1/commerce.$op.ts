import { createFileRoute } from "@tanstack/react-router";

// Worldway Travel Commerce API — POST https://worldwaytravelsgroup.com/api/v1/commerce/{operation}
// Auth: X-Api-Key (wwk_live_…) or a partner user's Bearer access token. Verified in the gateway.
export const Route = createFileRoute("/api/v1/commerce/$op")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleCommerceRequest } = await import("@/lib/commerce/partner-gateway.server");
        return handleCommerceRequest(request, params.op);
      },
    },
  },
});
