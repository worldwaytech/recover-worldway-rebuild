import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "wallet_transactions",
  title: "My wallet transactions",
  description: "List recent wallet transactions for the signed-in user.",
  inputSchema: {
    limit: z.number().int().default(20).describe("Max number of transactions to return."),
  },
  annotations: { readOnlyHint: true },
  handler: async ({ limit }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const email = ctx.getUserEmail();
    if (!email)
      return { content: [{ type: "text", text: "No email claim on token" }], isError: true };
    const { callPartner } = await import("@/lib/wwl.server");
    const res = await callPartner("walletTransactions", { clientEmail: email, limit });
    const { externalToolResult } = await import("@/lib/confidentiality/redact");
    return externalToolResult(res, !res.ok);
  },
});
