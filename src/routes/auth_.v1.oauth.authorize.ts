import { createFileRoute } from "@tanstack/react-router";

// Alias: OAuth clients (e.g. Microsoft Foundry) configured with the site host
// are redirected, query string intact, to the real authorization server.
// No auth logic lives here — the authorization server validates everything.
export const Route = createFileRoute("/auth_/v1/oauth/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ref = process.env["SUPABASE_URL"] ?? `https://${process.env["VITE_SUPABASE_PROJECT_ID"]}.supabase.co`;
        const target = new URL("/auth/v1/oauth/authorize", ref);
        target.search = new URL(request.url).search;
        return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
      },
    },
  },
});
