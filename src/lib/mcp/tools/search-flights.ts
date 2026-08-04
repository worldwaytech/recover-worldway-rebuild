import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_flights",
  title: "Search flights",
  description:
    "Search live flight inventory across suppliers via the Worldway partner network. Returns fares, cabin classes, and booking references.",
  inputSchema: {
    origin: z.string().describe("Origin IATA code or city, e.g. LHR or London."),
    destination: z.string().describe("Destination IATA code or city, e.g. DXB or Dubai."),
    depart_date: z.string().describe("Outbound date, YYYY-MM-DD."),
    return_date: z.string().optional().describe("Return date YYYY-MM-DD for round-trip."),
    passengers: z.number().int().default(1),
    cabin: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async (input) => {
    const { callPartner, toResolvedPartnerFlightPayload } = await import("@/lib/wwl.server");
    const payload = await toResolvedPartnerFlightPayload({
      origin: input.origin,
      destination: input.destination,
      depart_date: input.depart_date,
      return_date: input.return_date,
      passengers: input.passengers,
      cabin: input.cabin,
      trip_type: input.return_date ? "round_trip" : "one_way",
    });
    const res = await callPartner("flights", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(res) }],
      structuredContent: res as unknown as Record<string, unknown>,
      isError: !res.ok,
    };
  },
});
