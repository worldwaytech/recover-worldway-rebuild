import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_flights",
  title: "Search flights",
  description:
    "Search live Worldway flight inventory. Returns fares, cabins and offer IDs.",
  inputSchema: {
    origin: z.string().describe("Origin IATA code or city, e.g. DEL or Delhi."),
    destination: z.string().describe("Destination IATA code or city, e.g. BOM or Mumbai."),
    depart_date: z.string().describe("Outbound date, YYYY-MM-DD."),
    return_date: z.string().optional().describe("Return date YYYY-MM-DD for round-trip."),
    passengers: z.number().int().min(1).max(9).default(1),
    cabin: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async (input) => {
    const { invokeViaFabric } = await import("@/lib/ai/tools/mcp-bridge.server");
    return invokeViaFabric("mcp_search_flights", input, { authenticated: false });
  },
});
