import { createFileRoute } from "@tanstack/react-router";

// Alias: forwards token requests sent to the site host to the real
// authorization server's token endpoint unchanged (body and client auth headers).
export const Route = createFileRoute("/auth_/v1/oauth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ref = process.env["SUPABASE_URL"] ?? `https://${process.env["VITE_SUPABASE_PROJECT_ID"]}.supabase.co`;
        const headers = new Headers();
        for (const h of ["content-type", "authorization", "accept"]) {
          const v = request.headers.get(h);
          if (v) headers.set(h, v);
        }
        const res = await fetch(new URL("/auth/v1/oauth/token", ref), {
          method: "POST",
          headers,
          body: await request.text(),
          redirect: "manual",
        });
        return new Response(res.body, {
          status: res.status,
          headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
