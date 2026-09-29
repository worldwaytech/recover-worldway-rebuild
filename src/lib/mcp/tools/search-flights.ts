import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_flights",
  title: "Search flights",
  description:
    "Search live Worldway flight inventory. Routed by the Worldway engine to healthy flight suppliers by capability; returns fares, cabins and offer IDs.",
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
    const { searchFlightsViaEngine } = await import("@/lib/flights/flight-adapters.server");
    const { outcomes: _routing, ...res } = await searchFlightsViaEngine({
      origin: input.origin,
      destination: input.destination,
      depart_date: input.depart_date,
      return_date: input.return_date,
      passengers: input.passengers ?? 1,
      cabin: input.cabin ?? "economy",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(res) }],
      structuredContent: res as unknown as Record<string, unknown>,
      isError: !res.ok,
    };
  },
});
