import { createFileRoute } from "@tanstack/react-router";

// Returns only this runtime's outbound public IPv4 (for partner IP allow-listing).
export const Route = createFileRoute("/api/public/egress-ip")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const r = await fetch("https://api.ipify.org?format=json");
          const j = (await r.json()) as { ip?: string };
          return Response.json({ ipv4: j.ip ?? null, checkedAt: new Date().toISOString() });
        } catch {
          return Response.json({ ipv4: null }, { status: 502 });
        }
      },
    },
  },
});
