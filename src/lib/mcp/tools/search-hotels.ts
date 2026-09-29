import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_hotels",
  title: "Search hotels",
  description: "Search live hotel availability and rates from Worldway.",
  inputSchema: {
    destination: z.string().describe("City or hotel name, e.g. Dubai or The Ritz-Carlton Paris."),
    check_in: z.string().describe("Check-in date, YYYY-MM-DD."),
    check_out: z.string().describe("Check-out date, YYYY-MM-DD."),
    guests: z.number().int().default(2),
    rooms: z.number().int().default(1),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async (input) => {
    const { callPartner, toPartnerHotelPayload } = await import("@/lib/wwl.server");
    const res = await callPartner("hotels", toPartnerHotelPayload(input));
    const { externalToolResult } = await import("@/lib/confidentiality/redact");
    return externalToolResult(res, !res.ok);
  },
});
