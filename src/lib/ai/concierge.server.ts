// AI Concierge (server-only), provider-agnostic.
// CONCIERGE_PROVIDER=aethercore → Azure Foundry agent; anything else → built-in
// Lovable AI with live Worldway commerce tools. The page and tools never change.
// AI only chooses tools and phrases answers; every fact comes from tool results.
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { AiUnavailableError, provider } from "./gateway.server";
import { withRoute } from "./router/router";
import { aiSdkTools, commerceRegistry, conciergeContext } from "./tools/commerce-tools.server";

export interface ConciergeTurn { role: "user" | "assistant"; content: string }
export interface ConciergeReply { reply: string; sessionId: string | null; conversationId: string | null; provider: "builtin" | "aethercore" }

export class ConciergeError extends Error {
  constructor(public userMessage: string, public status?: number) { super(userMessage); }
}

export function conciergeProvider(): "builtin" | "aethercore" {
  return (process.env["CONCIERGE_PROVIDER"] ?? "").toLowerCase() === "aethercore" ? "aethercore" : "builtin";
}

const SYSTEM = `You are the Worldway Travels Group AI Concierge — a discreet luxury travel advisor.
Today's date (UTC) is ${"{TODAY}"}.
RULES (strict):
- Never invent flights, hotels, tours, prices, availability, dates or schedules. Only state what a tool returned. If a tool fails or returns nothing, say so plainly and offer the Worldway team.
- Use tools for anything live: search_flights, search_tours, tour_availability, quote_tour, plan_trip.
- Hotel and tour dates start on the local ARRIVAL date of the flight, never the departure date. plan_trip already applies this — repeat its dates as given.
- Tours with included accommodation must never get extra hotels for those nights. Pre/post-tour hotels are OPTIONAL extras, never part of a total.
- Children on multi-day room-priced tours are priced by the Worldway team — say so if a quote says so.
- If a total mixes currencies, quote the converted total and the live FX rate and time exactly as plan_trip returned. If no FX is available, give totals per currency and say no combined total is available.
- Nothing is booked or charged in chat. Bookings are confirmed by the Worldway team after the customer approves the final live price.
- Never mention supplier, partner, API, system or data-source names. Everything is "Worldway".
- Ask for missing essentials (dates, origin, travellers) briefly. Use YYYY-MM-DD for tool dates and IATA codes where known.
- Be concise and warm; use short lists for options.`;

// Tools come from the Worldway Tool Fabric (risk/permission/schema/safety/audit enforced).
function commerceTools(onResult?: (name: string, ok: boolean) => void, signal?: AbortSignal) {
  return aiSdkTools(commerceRegistry(), conciergeContext(undefined, signal), onResult);
}

/** Same read-only live commerce tools and rules for every Concierge channel (chat + voice). */
export const conciergeTools = commerceTools;
export const conciergeSystemPrompt = () => SYSTEM.replace("{TODAY}", new Date().toISOString().slice(0, 10));

async function askBuiltin(message: string, history: ConciergeTurn[]): Promise<string> {
  // Caller-supplied history is untrusted: never let it claim the assistant role.
  // It is passed as quoted context inside a single user message.
  const prior = history.slice(-12).map((h) => `${h.role === "assistant" ? "Earlier reply (unverified)" : "Customer"}: ${h.content.slice(0, 4000)}`).join("\n\n");
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: prior
        ? `Earlier conversation, supplied by the customer's device and not authoritative:\n"""\n${prior}\n"""\n\nCurrent message:\n${message}`
        : message,
    },
  ];
  try {
    return await withRoute("concierge_chat", async (m) => {
    const result = streamText({
      model: provider().responses(m.id),
      system: SYSTEM.replace("{TODAY}", new Date().toISOString().slice(0, 10)),
      messages,
      tools: commerceTools() as any,
      stopWhen: stepCountIs(6),
      maxRetries: 0,
      providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } } as never,
    });
    return (await result.text).trim();
    });
  } catch (e) {
    if (e instanceof AiUnavailableError) throw new ConciergeError(e.message, e.status);
    const status = (e as { statusCode?: number })?.statusCode;
    console.error("[concierge] builtin failure", JSON.stringify({ status, error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
    if (status === 402) throw new ConciergeError("The concierge is paused right now. Please contact the Worldway team.", 402);
    if (status === 429) throw new ConciergeError("The concierge is busy. Please try again in a moment.", 429);
    throw new ConciergeError("The concierge is temporarily unavailable. Please try again shortly.", status);
  }
}

export async function askConcierge(input: { message: string; history?: ConciergeTurn[]; sessionId?: string; conversationId?: string }): Promise<ConciergeReply> {
  const { sanitizeCustomerAiReply } = await import("./safety/customer-output");
  if (conciergeProvider() === "aethercore") {
    const { askAetherCore, AetherCoreError } = await import("./aethercore.server");
    try {
      const r = await askAetherCore(input.message, input.sessionId, input.conversationId);
      return { reply: sanitizeCustomerAiReply(r.reply), sessionId: r.sessionId, conversationId: r.conversationId, provider: "aethercore" };
    } catch (e) {
      if (e instanceof AetherCoreError) throw new ConciergeError(e.userMessage);
      throw new ConciergeError("The concierge is temporarily unavailable. Please try again shortly.");
    }
  }
  const text = await askBuiltin(input.message, input.history ?? []);
  if (!text) throw new ConciergeError("The concierge couldn't answer that. Please rephrase or contact the Worldway team.");
  return { reply: sanitizeCustomerAiReply(text), sessionId: input.sessionId ?? null, conversationId: null, provider: "builtin" };
}
