// AI Concierge (server-only), provider-agnostic.
// CONCIERGE_PROVIDER=aethercore → Azure Foundry agent; anything else → built-in
// Lovable AI with live Worldway commerce tools. The page and tools never change.
// AI only chooses tools and phrases answers; every fact comes from tool results.
import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { AI_MODEL, AiUnavailableError, provider } from "./gateway.server";
import { CommerceSchemas, runCommerce, type CommerceOp } from "@/lib/commerce/commerce.server";

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

const TOOLS: Record<string, { op: CommerceOp; description: string }> = {
  search_flights: { op: "searchFlights", description: "Search live flights (one-way or return). Returns live fares." },
  search_tours: { op: "searchTours", description: "Search the Worldway tour catalogue by keywords, city or country. 'from' prices are indicative." },
  tour_availability: { op: "tourAvailability", description: "Live open dates and per-adult prices for a tour from a date." },
  quote_tour: { op: "quoteTour", description: "Live total price for a tour on a date for a group. Use before stating any tour total." },
  plan_trip: { op: "planTrip", description: "Build a live trip plan: flights out and back, hotels from the arrival date, optional tour selection (tour_ref from its tours list), optional stays, FX-converted totals." },
};

function commerceTools(onResult?: (name: string, ok: boolean) => void) {
  return Object.fromEntries(Object.entries(TOOLS).map(([name, t]) => [name, tool({
    description: t.description,
    inputSchema: CommerceSchemas[t.op] as any,
    execute: async (input: unknown) => {
      try { const r = await runCommerce(t.op, input); onResult?.(name, true); return r; }
      catch (e) { onResult?.(name, false); throw e; }
    },
  })]));
}

/** Same read-only live commerce tools and rules for every Concierge channel (chat + voice). */
export const conciergeTools = commerceTools;
export const conciergeSystemPrompt = () => SYSTEM.replace("{TODAY}", new Date().toISOString().slice(0, 10));

async function askBuiltin(message: string, history: ConciergeTurn[]): Promise<string> {
  const messages: ModelMessage[] = [
    ...history.slice(-12).map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }) as ModelMessage),
    { role: "user", content: message },
  ];
  try {
    const result = streamText({
      model: provider().responses(AI_MODEL),
      system: SYSTEM.replace("{TODAY}", new Date().toISOString().slice(0, 10)),
      messages,
      tools: commerceTools() as any,
      stopWhen: stepCountIs(6),
      maxRetries: 0,
      providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } } as never,
    });
    return (await result.text).trim();
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
  const { redactText } = await import("@/lib/confidentiality/redact");
  if (conciergeProvider() === "aethercore") {
    const { askAetherCore, AetherCoreError } = await import("./aethercore.server");
    try {
      const r = await askAetherCore(input.message, input.sessionId, input.conversationId);
      return { reply: redactText(r.reply), sessionId: r.sessionId, conversationId: r.conversationId, provider: "aethercore" };
    } catch (e) {
      if (e instanceof AetherCoreError) throw new ConciergeError(e.userMessage);
      throw new ConciergeError("The concierge is temporarily unavailable. Please try again shortly.");
    }
  }
  const text = await askBuiltin(input.message, input.history ?? []);
  if (!text) throw new ConciergeError("The concierge couldn't answer that. Please rephrase or contact the Worldway team.");
  return { reply: redactText(text), sessionId: input.sessionId ?? null, conversationId: null, provider: "builtin" };
}
