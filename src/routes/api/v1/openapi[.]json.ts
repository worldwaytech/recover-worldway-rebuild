import { createFileRoute } from "@tanstack/react-router";
import { OPENAPI_SPEC } from "@/lib/commerce/openapi";

// Public OpenAPI 3.1 document. Contains no secrets, supplier names or internal endpoints.
export const Route = createFileRoute("/api/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(OPENAPI_SPEC, null, 2), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
        }),
    },
  },
});
