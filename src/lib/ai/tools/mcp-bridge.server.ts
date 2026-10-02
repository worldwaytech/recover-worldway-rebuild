// MCP → Tool Fabric bridge. MCP endpoints and tool names are unchanged; every
// MCP call now passes the fabric's context/auth/risk/schema/safety/audit checks.
import { externalToolResult } from "@/lib/confidentiality/redact";
import { ToolDeniedError, type ToolContext } from "./fabric";
import { worldwayRegistry } from "./worldway-tools.server";
import { newCorrelationId } from "../router/telemetry";

export interface McpCallerInfo { authenticated: boolean; userId?: string | null }

export function mcpContext(caller: McpCallerInfo): ToolContext {
  return {
    correlationId: newCorrelationId(),
    context: "mcp",
    principal: caller.authenticated
      ? { permission: "authenticated", scopes: ["commerce:read", "wallet:read"], userId: caller.userId ?? null }
      : { permission: "public", scopes: ["commerce:read"], userId: null },
  };
}

export async function invokeViaFabric(tool: string, input: unknown, caller: McpCallerInfo) {
  try {
    const out = (await worldwayRegistry().invoke(tool, input, mcpContext(caller))) as { ok?: boolean };
    return externalToolResult(out, out?.ok === false);
  } catch (e) {
    const msg = e instanceof ToolDeniedError ? (e.reason === "authentication" || e.reason === "permission" ? "Not authenticated" : "Request not allowed") : "The request could not be completed.";
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}
