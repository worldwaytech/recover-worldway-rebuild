import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "wallet_balance",
  title: "My wallet balance",
  description: "Return the signed-in user's Worldway wallet balances across currencies.",
  inputSchema: {},
  annotations: { readOnlyHint: true },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const email = ctx.getUserEmail();
    if (!email) {
      return { content: [{ type: "text", text: "No email claim on token" }], isError: true };
    }
    const { invokeViaFabric } = await import("@/lib/ai/tools/mcp-bridge.server");
    return invokeViaFabric("wallet_balance", { clientEmail: email }, { authenticated: true, userId: email });
  },
});
