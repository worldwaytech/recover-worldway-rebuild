import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Mic, MicOff, PhoneOff, Phone } from "lucide-react";
import { PageShell } from "@/components/search-shell";
import { Button } from "@/components/ui/button";
import { useLiveVoice, type LiveEvent } from "@/hooks/use-live-voice";

export const Route = createFileRoute("/concierge-voice")({
  head: () => ({
    meta: [
      { title: "Voice Concierge — Worldway Travels Group" },
      { name: "description", content: "Speak with the Worldway concierge for live flights, tours and trip plans." },
      { property: "og:title", content: "Voice Concierge — Worldway Travels Group" },
      { property: "og:description", content: "Talk through your trip and hear live options from Worldway." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoicePage,
});

type Line = { role: "user" | "assistant"; text: string; start: number };
const TOOL_LABEL: Record<string, string> = {
  search_flights: "Checked live flights", search_tours: "Searched tours", tour_availability: "Checked tour dates",
  quote_tour: "Priced a tour live", plan_trip: "Built a live trip plan",
};

function VoicePage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [progress, setProgress] = useState<string[]>([]);
  const onEvent = useCallback((e: LiveEvent) => {
    const ev = e as LiveEvent & { delta?: string; start_ms?: number; tool?: string; plan?: { tool: string; ok: boolean } };
    if (ev.type === "session.input_transcript.delta" || ev.type === "session.output_transcript.delta") {
      const role = ev.type.includes("input") ? "user" : "assistant";
      const delta = ev.delta ?? "";
      setLines((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role) return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
        return [...prev, { role, text: delta, start: ev.start_ms ?? 0 }];
      });
    }
    if (ev.type === "app.concierge.tool" && ev.plan) {
      const p = ev.plan;
      setProgress((prev) => [...prev.slice(-5), `${TOOL_LABEL[p.tool] ?? "Checked live options"}${p.ok ? "" : " — not available right now"}`]);
    }
  }, []);
  const call = useLiveVoice({ onEvent });
  const idle = call.status === "idle" || call.status === "closed";
  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Worldway Concierge</p>
        <h1 className="mt-2 font-serif text-4xl">Speak with your concierge</h1>
        <p className="mt-3 text-sm text-muted-foreground">Ask about flights, tours and trip plans. Every price and date you hear is checked live. Nothing is booked or charged on this call — our team confirms bookings after you approve the final price.</p>

        <div className="mt-8 rounded-2xl border border-border/60 bg-card p-6">
          <audio ref={call.audioRef} controls className="w-full" />
          <p role="status" className="mt-3 text-sm">Status: {call.status === "connected" ? "Connected — speak any time" : call.status}</p>
          {call.error && <p role="alert" className="mt-2 text-sm text-destructive">{call.error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!idle} onClick={call.start}><Phone className="mr-2 h-4 w-4" />Start call</Button>
            <Button variant="outline" disabled={call.status !== "connected"} onClick={() => call.setMuted(!call.muted)}>
              {call.muted ? <><Mic className="mr-2 h-4 w-4" />Unmute</> : <><MicOff className="mr-2 h-4 w-4" />Mute</>}
            </Button>
            <Button variant="outline" disabled={idle || call.status === "stopping"} onClick={call.stop}><PhoneOff className="mr-2 h-4 w-4" />End call</Button>
            {call.playbackBlocked && <Button variant="secondary" onClick={call.resumePlayback}>Play voice</Button>}
          </div>
          {progress.length > 0 && <ul className="mt-4 space-y-1 text-xs text-muted-foreground">{progress.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </div>

        <div className="mt-6 space-y-3">
          {lines.map((l, i) => (
            <p key={i} className={l.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[85%] text-sm"}>{l.text}</p>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">Prefer typing? <Link to="/concierge" className="underline">Chat with the concierge</Link>.</p>
      </section>
    </PageShell>
  );
}
