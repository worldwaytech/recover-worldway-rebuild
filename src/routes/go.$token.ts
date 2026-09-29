import { createFileRoute } from "@tanstack/react-router";

// Neutral Worldway outbound link. Only genuine sealed Worldway references are
// accepted (authenticated encryption), so this is not an open redirect.
export const Route = createFileRoute("/go/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { unseal } = await import("@/lib/confidentiality/seal.server");
        const v = await unseal(String(params.token).slice(0, 8192));
        if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return new Response("Not found", { status: 404 });
        return new Response(null, {
          status: 302,
          headers: { Location: v, "Referrer-Policy": "no-referrer", "Cache-Control": "private, max-age=300" },
        });
      },
    },
  },
});
