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
    const { invokeViaFabric } = await import("@/lib/ai/tools/mcp-bridge.server");
    const result = await invokeViaFabric("wallet_transactions", { clientEmail: email, limit: Math.min(100, Math.max(1, limit ?? 20)) }, { authenticated: true, userId: email });
    // Defence in depth: the fabric already sanitised; MCP output is sanitised again at the protocol edge.
    return (await import("@/lib/confidentiality/guard.server")).sanitizeOutbound(result, { absolute: true });
  },
});
