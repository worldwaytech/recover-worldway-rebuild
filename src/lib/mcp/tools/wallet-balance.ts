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
    const { callPartner } = await import("@/lib/wwl.server");
    const res = await callPartner("walletBalance", { clientEmail: email });
    return {
      content: [{ type: "text", text: JSON.stringify(res) }],
      structuredContent: res as unknown as Record<string, unknown>,
      isError: !res.ok,
    };
  },
});
