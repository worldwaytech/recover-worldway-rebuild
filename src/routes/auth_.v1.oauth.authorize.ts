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
        const incoming = new URL(request.url);
        target.search = incoming.search;
        // Temporary diagnostic: record the raw redirect_uri / client_id an OAuth client sends.
        // These params carry no secrets; tokens, codes, cookies and headers are never recorded.
        const rawQuery = incoming.search;
        const rawRedirect = incoming.searchParams.get("redirect_uri");
        const clientId = incoming.searchParams.get("client_id");
        console.log("[oauth-authorize] client_id=%s redirect_uri=%s", clientId, rawRedirect);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("integration_logs").insert({
            provider_key: "oauth_authorize_probe",
            level: "info",
            operation: "authorize_redirect_uri",
            status: "ok",
            message: rawRedirect ?? "(missing redirect_uri)",
            detail: {
              client_id: clientId,
              redirect_uri_raw: rawRedirect,
              redirect_uri_encoded: rawQuery.match(/[?&]redirect_uri=([^&]*)/)?.[1] ?? null,
              response_type: incoming.searchParams.get("response_type"),
              scope: incoming.searchParams.get("scope"),
              code_challenge_method: incoming.searchParams.get("code_challenge_method"),
              param_names: [...incoming.searchParams.keys()],
            },
          });
        } catch {
          // diagnostics must never block the OAuth flow
        }

        return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
      },
    },
  },
});
