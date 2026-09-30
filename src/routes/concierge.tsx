import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageShell, PageHero } from "@/components/search-shell";
import { inputClass } from "@/components/search-form";
import { conciergeChat } from "@/lib/wwl.functions";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "@/components/membership-upgrade-dialog";
import { LocationAutocomplete } from "@/components/location-autocomplete";

export const Route = createFileRoute("/concierge")({
  validateSearch: (search: Record<string, unknown>): { prompt?: string } =>
    typeof search.prompt === "string" ? { prompt: search.prompt.slice(0, 400) } : {},
  head: () => ({
    meta: [
      { title: "AI Concierge — Worldway Travels Group" },
      { name: "description", content: "24/7 AI travel concierge for bespoke arrangements." },
    ],
  }),
  component: ConciergePage,
});

type Msg = { role: "user" | "assistant"; content: string };

function extractReply(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.reply === "string") return d.reply;
    if (typeof d.message === "string") return d.message;
    if (typeof d.content === "string") return d.content;
    if (typeof d.answer === "string") return d.answer;
  }
  return JSON.stringify(data, null, 2);
}

function ConciergePage() {
  const runConciergeChat = useServerFn(conciergeChat);
  const { prompt } = Route.useSearch();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Good day. I'm your Worldway concierge — where shall we begin?" },
  ]);
  const [input, setInput] = useState<string>(prompt ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState(false);
  const sessionId = useMemo(
    () => `wtg-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [],
  );
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const SUGGESTIONS = [
    "Plan a 5-day romantic escape to the Amalfi coast in September",
    "Private jet options from Delhi to the Maldives next weekend",
    "Best time and villa for a family safari in Kenya",
    "Curate a Michelin dining itinerary in Tokyo for 3 nights",
  ];

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!portal.hasAiAccess()) {
      setGate(true);
      return;
    }
    const text = input.trim();
    if (!text) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await runConciergeChat({
        data: { message: text, session_id: sessionId, history: messages.slice(-12).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), ...(conversationRef.current ? { conversation_id: conversationRef.current } : {}) },
      });
      if (!res.ok) setError(res.error ?? "Request failed");
      else {
        const cid = (res.data as { conversation_id?: string | null } | undefined)?.conversation_id;
        if (cid) conversationRef.current = cid;
        setMessages([...next, { role: "assistant", content: extractReply(res.data) || "…" }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="AI Concierge"
        title="Ask anything. Anywhere. Anytime."
        subtitle="A discreet, always-on intelligence for travel arrangements."
        image="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=2000&q=80"
      />
      <section className="mx-auto -mt-16 max-w-3xl px-6">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">Conversation</div>
          <div ref={scrollRef} className="max-h-[520px] space-y-4 overflow-y-auto pr-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground"
                      : "max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-background/60 px-4 py-3 text-sm text-foreground"
                  }
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-headings:font-serif prose-headings:text-foreground prose-p:my-2 prose-li:my-0.5 prose-a:text-primary prose-strong:text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                  </span>
                </div>
              </div>
            ) : null}
            {error ? <div className="text-xs text-destructive">{error}</div> : null}
          </div>
          {messages.length <= 1 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <form onSubmit={send} className="mt-5 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="A quiet villa on the Amalfi coast, next August…"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-primary px-6 py-2 text-xs uppercase tracking-[0.3em] text-primary-foreground disabled:opacity-60"
            >
              Send
            </button>
          </form>
          <div className="mt-3">
            <LocationAutocomplete
              name="concierge_location"
              kind="locations"
              label="Add location context (optional)"
              placeholder="Search a city or airport…"
              onSelect={(row) => {
                const label = row.iata
                  ? `${row.iata}${row.city ? ` (${row.city})` : ""}`
                  : [row.city, row.country].filter(Boolean).join(", ");
                setInput((v) => (v ? `${v} — ${label}` : `Regarding ${label}: `));
              }}
            />
          </div>
        </div>
      </section>
      <div className="h-24" />
      <MembershipUpgradeDialog open={gate} onOpenChange={setGate} reason="ai" />
    </PageShell>
  );
}
