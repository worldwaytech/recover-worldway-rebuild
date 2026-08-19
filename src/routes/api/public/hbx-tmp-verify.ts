// TEMPORARY verification route — deleted after HBX TEST certification checks.
import { createFileRoute } from "@tanstack/react-router";

const TOKEN = "wwl-hbx-tmp-2f9a41c7";

export const Route = createFileRoute("/api/public/hbx-tmp-verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== TOKEN) {
          return new Response("Not found", { status: 404 });
        }
        const mode = url.searchParams.get("mode") ?? "health";
        const { hbxSuiteHealth } = await import("@/lib/hbx/client.server");
        if (mode === "health") {
          const suites = await Promise.all([
            hbxSuiteHealth("hotels"),
            hbxSuiteHealth("activities"),
            hbxSuiteHealth("transfers"),
          ]);
          return Response.json({ suites });
        }
        if (mode === "raw") {
          const { hbxCall } = await import("@/lib/hbx/client.server");
          const suite = (url.searchParams.get("suite") ?? "activities") as "hotels" | "activities" | "transfers";
          const path = url.searchParams.get("path") ?? "/countries";
          const qs = url.searchParams.get("qs");
          const base = (url.searchParams.get("base") === "booking" ? "booking" : "content") as "booking" | "content";
          const r = await hbxCall({ suite, path, base, query: qs ? (JSON.parse(qs) as Record<string, string>) : {}, cacheTtlSeconds: 0, operation: "raw" });
          return new Response(JSON.stringify(r).slice(0, 900), { headers: { "content-type": "application/json" } });
        }
        if (mode === "direct") {
          const { hbxSignature } = await import("@/lib/hbx/client.server");
          const suite = url.searchParams.get("suite") ?? "transfers";
          const envMap: Record<string, [string, string]> = {
            hotels: ["HBX_HOTEL_API_KEY", "HBX_HOTEL_SECRET"],
            activities: ["HBX_ACTIVITY_API_KEY", "HBX_ACTIVITY_SECRET"],
            transfers: ["HBX_TRANSFER_API_KEY", "HBX_TRANSFER_SECRET"],
          };
          const pair = envMap[suite]!;
          const key = process.env[pair[0]]!;
          const secret = process.env[pair[1]]!;
          const sig = hbxSignature(key, secret, Math.floor(Date.now() / 1000));
          const target = "https://api.test.hotelbeds.com" + (url.searchParams.get("full") ?? "");
          const bodyParam = url.searchParams.get("body");
          const res = await fetch(target, {
            method: bodyParam ? "POST" : "GET",
            headers: {
              "Api-key": key,
              "X-Signature": sig,
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              ...(bodyParam ? { "Content-Type": "application/json" } : {}),
            },
            ...(bodyParam ? { body: bodyParam } : {}),
          });
          const text = await res.text();
          return Response.json({ status: res.status, body: text.slice(0, 800) });
        }
        if (mode === "actpage") {
          const { fetchActivityContentPage } = await import("@/lib/hbx/activities.server");
          void fetchActivityContentPage;
          const { hbxCall } = await import("@/lib/hbx/client.server");
          const { hbxActivitiesResponseSchema } = await import("@/lib/hbx/types");
          const raw = await hbxCall<unknown>({ suite: "activities", api: "booking", path: "/activities", method: "POST", cacheTtlSeconds: 0, body: { language: "en", pagination: { itemsPerPage: 5, page: 1 }, filters: [{ searchFilterItems: [{ type: "destination", value: "PMI" }] }], from: "2026-09-18", to: "2026-09-25" }, operation: "diag" });
          const parsed = hbxActivitiesResponseSchema.safeParse((raw as { data?: unknown }).data);
          return new Response(JSON.stringify({ ok: raw.ok, issues: parsed.success ? null : parsed.error.issues.slice(0, 6) }).slice(0, 1500), { headers: { "content-type": "application/json" } });
        }
        const ingest = await import("@/lib/hbx/ingest.server");
        if (mode === "sync-hotels") {
          return Response.json(await ingest.syncHbxHotels({ maxPages: 1 }));
        }
        if (mode === "sync-activities") {
          return Response.json(await ingest.syncHbxActivities({ maxPages: 1 }));
        }
        if (mode === "sync-transfers") {
          return Response.json(await ingest.syncHbxTransfers({ countryCodes: ["ES"] }));
        }
        if (mode === "summary") {
          return Response.json(await ingest.hbxSyncSummary());
        }
        return new Response("bad mode", { status: 400 });
      },
    },
  },
});
