import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUpRight,
  Plane,
  BedDouble,
  Compass,
  Mountain,
  Car,
  Ship,
  UtensilsCrossed,
  Map as MapIcon,
  MapPin,
  Lock,
  ShieldCheck,
  Clock3,
  CornerDownLeft,
  X,
} from "lucide-react";
import { PageShell } from "@/components/search-shell";
import { conciergeChat } from "@/lib/wwl.functions";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "@/components/membership-upgrade-dialog";
import { LocationAutocomplete } from "@/components/location-autocomplete";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=2000&q=80";

export const Route = createFileRoute("/concierge")({
  validateSearch: (search: Record<string, unknown>): { prompt?: string } =>
    typeof search.prompt === "string" ? { prompt: search.prompt.slice(0, 400) } : {},
  head: () => ({
    meta: [
      { title: "Private AI Concierge — Worldway Travels Group" },
      {
        name: "description",
        content:
          "A discreet, always-on private travel concierge for aviation, hotels, journeys and bespoke itineraries.",
      },
      { property: "og:title", content: "Private AI Concierge — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Private, discreet and highly curated travel arrangements, any hour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: HERO_IMAGE },
      { name: "twitter:image", content: HERO_IMAGE },
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

const SUGGESTIONS = [
  { tag: "Escape", text: "Plan a 5-day romantic escape to the Amalfi coast in September" },
  { tag: "Aviation", text: "Private jet options from Delhi to the Maldives next weekend" },
  { tag: "Safari", text: "Best time and villa for a family safari in Kenya" },
  { tag: "Dining", text: "Curate a Michelin dining itinerary in Tokyo for 3 nights" },
];

const CAPABILITIES = [
  { icon: Plane, title: "Private aviation", body: "Charter options and live partner estimates, arranged by our aviation desk.", to: "/private-jets" },
  { icon: BedDouble, title: "Luxury hotels", body: "Suites, villas and residences with live availability where offered.", to: "/hotels" },
  { icon: Compass, title: "Journeys", body: "Signature multi-day journeys, adapted to your dates and party.", to: "/journeys" },
  { icon: Mountain, title: "Experiences", body: "Guided tours and private experiences across hundreds of destinations.", to: "/tours" },
  { icon: Car, title: "Transfers", body: "Chauffeured arrivals and onward connections, timed to your flights.", to: "/transfers" },
  { icon: Ship, title: "Voyages", body: "Ocean and river voyages, from grand ships to intimate yachts.", to: "/cruises" },
  { icon: UtensilsCrossed, title: "Dining", body: "Considered restaurant itineraries and recommendations — reservations via our team." },
  { icon: MapIcon, title: "Bespoke itineraries", body: "Flights, stays and experiences sequenced into one coherent plan." },
] as const;

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
  const [place, setPlace] = useState<string | null>(null);
  const sessionId = useMemo(
    () => `wtg-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [],
  );
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!portal.hasAiAccess()) {
      setGate(true);
      return;
    }
    const raw = input.trim();
    if (!raw || loading) return;
    const text = place ? `${raw}\n\n(Location context: ${place})` : raw;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await runConciergeChat({
        data: {
          message: text,
          session_id: sessionId,
          history: messages.slice(-12).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          ...(conversationRef.current ? { conversation_id: conversationRef.current } : {}),
        },
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

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const exchanges = messages.filter((m) => m.role === "user").length;

  return (
    <PageShell>
      {/* Editorial hero */}
      <section className="relative isolate overflow-hidden border-b border-primary/15">
        <img
          src={HERO_IMAGE}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40"
          loading="eager"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="mx-auto grid max-w-7xl gap-10 px-6 pb-14 pt-16 md:pt-20 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-end lg:pb-16">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-primary">
              <span className="h-px w-10 bg-primary/60" />
              Private Concierge
            </div>
            <h1 className="mt-6 font-serif text-5xl font-light leading-[1.02] text-foreground md:text-6xl lg:text-7xl">
              Your private travel desk,
              <span className="block italic text-primary">at any hour.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Speak as you would to a trusted advisor. The Concierge consults live Worldway availability and pricing,
              then shapes it into something considered.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-primary/20 bg-primary/15 text-center lg:mb-2">
            {[
              { icon: Clock3, k: "Availability", v: "24 / 7" },
              { icon: ShieldCheck, k: "Pricing", v: "Live" },
              { icon: Lock, k: "Discreet", v: "Private" },
            ].map(({ icon: Icon, k, v }) => (
              <div key={k} className="bg-background/80 px-3 py-5 backdrop-blur-md">
                <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden />
                <dd className="mt-3 font-serif text-2xl text-foreground">{v}</dd>
                <dt className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{k}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Advisor desk */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Context rail */}
          <aside className="order-2 flex flex-col gap-6 lg:order-1">
            <div className="rounded-sm border border-primary/15 bg-card/50 p-5 backdrop-blur">
              <div className="text-[10px] uppercase tracking-[0.35em] text-primary">Trip context</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Optionally anchor the conversation to a city or airport.
              </p>
              <div className="mt-4">
                {place ? (
                  <div className="flex items-center justify-between gap-2 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="truncate">{place}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlace(null)}
                      aria-label="Remove location context"
                      className="shrink-0 text-muted-foreground transition hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <LocationAutocomplete
                    name="concierge_location"
                    kind="locations"
                    label="Location"
                    placeholder="Search a city or airport…"
                    onSelect={(row) => {
                      const label = row.iata
                        ? `${row.iata}${row.city ? ` (${row.city})` : ""}`
                        : [row.city, row.country].filter(Boolean).join(", ");
                      setPlace(label);
                    }}
                  />
                )}
              </div>
            </div>

            <div className={`rounded-sm border border-primary/15 bg-card/50 p-5 backdrop-blur ${messages.length <= 1 ? "hidden" : ""}`}>
              <div className="text-[10px] uppercase tracking-[0.35em] text-primary">Begin with</div>
              <ul className="mt-4 divide-y divide-border/60">
                {SUGGESTIONS.map((s) => (
                  <li key={s.text}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(s.text);
                        inputRef.current?.focus();
                      }}
                      className="group flex w-full items-start gap-3 py-3 text-left"
                    >
                      <span className="mt-0.5 w-16 shrink-0 text-[10px] uppercase tracking-[0.2em] text-primary/80">
                        {s.tag}
                      </span>
                      <span className="flex-1 text-sm leading-snug text-muted-foreground transition group-hover:text-foreground">
                        {s.text}
                      </span>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition group-hover:opacity-100" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-sm border border-border/60 p-5 text-xs leading-relaxed text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden /> Our promise
              </div>
              Prices and availability are checked live and confirmed again before anything is booked. Nothing is
              reserved or charged without your approval.
            </div>
          </aside>

          {/* Conversation */}
          <div
            className="order-1 flex min-h-[560px] lg:min-h-[640px] flex-col overflow-hidden rounded-sm border border-primary/25 bg-card/60 backdrop-blur-xl lg:order-2 lg:h-[760px]"
            style={{ boxShadow: "var(--shadow-portal)" }}
          >
            <header className="flex items-center justify-between gap-4 border-b border-primary/15 px-5 py-4 sm:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/40 font-serif text-lg italic text-primary">
                  W
                </div>
                <div className="min-w-0">
                  <div className="truncate font-serif text-lg text-foreground">The Worldway Concierge</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    {loading ? "Considering your request…" : "AI concierge · our travel team on hand"}
                  </div>
                </div>
              </div>
              <div className="hidden shrink-0 text-right text-[10px] uppercase tracking-[0.3em] text-muted-foreground sm:block">
                {exchanges === 0 ? "New conversation" : `${exchanges} ${exchanges === 1 ? "request" : "requests"}`}
              </div>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-7 overflow-y-auto px-5 py-8 sm:px-10"
              aria-live="polite"
              aria-busy={loading}
            >
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[70%]">
                      <div className="mb-1.5 text-right text-[10px] uppercase tracking-[0.3em] text-muted-foreground">You</div>
                      <div className="whitespace-pre-wrap rounded-sm border border-primary/40 bg-primary/10 px-5 py-3.5 text-sm leading-relaxed text-foreground">
                        {m.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-4">
                    <div className="mt-1 h-full w-px shrink-0 self-stretch bg-gradient-to-b from-primary/70 to-transparent" />
                    <div className="min-w-0 max-w-3xl">
                      <div className="mb-1.5 text-[10px] uppercase tracking-[0.3em] text-primary">Concierge</div>
                      <div className="prose prose-invert max-w-none text-[15px] leading-relaxed prose-headings:font-serif prose-headings:font-normal prose-headings:text-foreground prose-p:my-2 prose-li:my-0.5 prose-a:text-primary prose-strong:text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ),
              )}
              {messages.length <= 1 && !loading ? (
                <div className="pt-6">
                  <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
                    <span className="h-px flex-1 bg-border/60" /> A few ways to begin <span className="h-px flex-1 bg-border/60" />
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.text}
                        type="button"
                        onClick={() => {
                          setInput(s.text);
                          inputRef.current?.focus();
                        }}
                        className="group rounded-sm border border-border/60 bg-background/40 p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-background/70"
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-primary">
                          {s.tag}
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-40 transition group-hover:opacity-100" aria-hidden />
                        </div>
                        <div className="mt-3 font-serif text-lg leading-snug text-foreground">{s.text}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {loading ? (
                <div className="flex gap-4">
                  <div className="w-px shrink-0 bg-primary/50" />
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-primary">Concierge</div>
                    <span className="inline-flex items-center gap-1.5" aria-label="Concierge is typing">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    </span>
                  </div>
                </div>
              ) : null}
              {error ? (
                <div role="alert" className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                  {error}
                </div>
              ) : null}
            </div>

            <form onSubmit={send} className="border-t border-primary/15 bg-background/40 p-4 sm:p-5">
              {place ? (
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3 text-primary" aria-hidden /> Regarding {place}
                </div>
              ) : null}
              <div className="flex items-end gap-3 rounded-sm border border-border/70 bg-background/60 p-2 transition focus-within:border-primary/60">
                <label htmlFor="concierge-input" className="sr-only">Your request</label>
                <textarea
                  id="concierge-input"
                  ref={inputRef}
                  value={input}
                  rows={2}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="A quiet villa on the Amalfi coast, next August…"
                  className="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="shrink-0 rounded-sm px-5 py-3 text-[11px] uppercase tracking-[0.3em] text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundImage: "var(--gradient-gold)" }}
                >
                  Send
                </button>
              </div>
              <div className="mt-2 hidden items-center gap-1.5 px-1 text-[10px] text-muted-foreground sm:flex">
                <CornerDownLeft className="h-3 w-3" aria-hidden /> Enter to send · Shift + Enter for a new line
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-t border-primary/15 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.4em] text-primary">What we arrange</div>
              <h2 className="mt-4 font-serif text-4xl font-light leading-tight text-foreground md:text-5xl">
                One conversation. <span className="italic">Every detail.</span>
              </h2>
            </div>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground md:justify-self-end">
              The Concierge draws on the same live inventory as our travel desk. Where something needs a human touch,
              our team takes it from there.
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-primary/15 bg-primary/15 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => {
              const inner = (
                <>
                  <c.icon className="h-5 w-5 text-primary" aria-hidden />
                  <div className="mt-6 flex items-center justify-between gap-2">
                    <h3 className="font-serif text-xl text-foreground">{c.title}</h3>
                    {"to" in c ? (
                      <ArrowUpRight className="h-4 w-4 text-primary opacity-0 transition group-hover:opacity-100" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </>
              );
              return "to" in c ? (
                <Link key={c.title} to={c.to} className="group bg-background p-6 transition hover:bg-card">
                  {inner}
                </Link>
              ) : (
                <div key={c.title} className="bg-background p-6">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <MembershipUpgradeDialog open={gate} onOpenChange={setGate} reason="ai" />
    </PageShell>
  );
}
