// Lightweight, privacy-preserving analytics bus.
// Events are buffered in-session and forwarded to any analytics sink that has
// registered itself on window (GA4, Plausible, Segment) — no vendor lock-in and
// no personal data ever leaves the page.

export type AnalyticsEvent = {
  name: string;
  props: Record<string, string | number | boolean>;
  at: number;
};

const BUFFER: AnalyticsEvent[] = [];
const MAX = 200;

type Sink = (event: AnalyticsEvent) => void;
const sinks: Sink[] = [];

export function registerAnalyticsSink(sink: Sink) {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

export function track(name: string, props: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  const event: AnalyticsEvent = { name, props, at: Date.now() };
  BUFFER.push(event);
  if (BUFFER.length > MAX) BUFFER.shift();
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      /* a failing sink must never break the UI */
    }
  }
  const w = window as unknown as { dataLayer?: unknown[] };
  if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: name, ...props });
}

export function recentEvents() {
  return [...BUFFER];
}
