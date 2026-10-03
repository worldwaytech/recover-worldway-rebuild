import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { EmptyLeg } from "@/lib/empty-legs-data";
import { getAircraft } from "@/lib/empty-legs-data";
import { submitAviationInquiry } from "@/lib/aviation-inquiries.functions";

type Intent = "book" | "quote" | "callback";

export function EmptyLegInquiry({
  leg,
  open,
  intent,
  onOpenChange,
}: {
  leg: EmptyLeg | null;
  open: boolean;
  intent: Intent;
  onOpenChange: (v: boolean) => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = useServerFn(submitAviationInquiry);
  const aircraft = leg ? getAircraft(leg.aircraftSlug) : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    const paxRaw = f.get("passengers");
    const paxNum =
      typeof paxRaw === "string" && paxRaw.trim() !== "" ? Number(paxRaw) : undefined;
    const payload = {
      intent,
      legId: leg?.id,
      fullName: String(f.get("full_name") ?? "").trim(),
      email: String(f.get("email") ?? "").trim(),
      phone: String(f.get("phone") ?? "").trim(),
      passengers: Number.isFinite(paxNum) && paxNum ? paxNum : undefined,
      notes: String(f.get("notes") ?? "").trim() || undefined,
      source: "empty-legs",
    };
    setBusy(true);
    try {
      const res = await send({ data: payload });
      if (!res?.ok) {
        setErr(
          res?.error ?? "Could not send inquiry. Please email aviation@worldwaytravelsgroup.com.",
        );
        return;
      }
      // Best-effort local record so users see their submission if they revisit.
      // The server intentionally does not expose its internal database ID.
      try {
        const raw = localStorage.getItem("wwl.aviation.inquiries");
        const list = raw ? JSON.parse(raw) : [];
        list.push({ ...payload, submittedAt: new Date().toISOString() });
        localStorage.setItem("wwl.aviation.inquiries", JSON.stringify(list));
      } catch {
        /* ignore */
      }
      setSubmitted(true);
    } catch (unknownErr) {
      const msg = unknownErr instanceof Error ? unknownErr.message : "Network error";
      setErr(`Could not send inquiry: ${msg}. Please email aviation@worldwaytravelsgroup.com.`);
    } finally {
      setBusy(false);
    }
  }

  const title =
    intent === "book"
      ? "Request Booking"
      : intent === "quote"
        ? "Request Quote"
        : "Concierge Callback";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSubmitted(false);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
          <DialogDescription>
            {leg && aircraft ? (
              <>
                {aircraft.name} · {leg.fromCity} ({leg.fromIata}) → {leg.toCity} ({leg.toIata})
              </>
            ) : (
              "Send your details and the Worldway Private Aviation Concierge will confirm availability."
            )}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-3 py-4 text-sm text-muted-foreground">
            <p className="text-foreground">
              Received. Our Private Aviation Concierge will be in touch within 30 minutes.
            </p>
            <p className="text-xs">
              Availability is indicative only and subject to confirmation by our Private Aviation
              Team.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input name="full_name" required placeholder="Full name" className={fieldClass} />
            <input name="email" required type="email" placeholder="Email" className={fieldClass} />
            <input name="phone" required placeholder="Phone / WhatsApp" className={fieldClass} />
            <input
              name="passengers"
              type="number"
              min={1}
              max={25}
              defaultValue={leg?.seats ?? 4}
              placeholder="Passengers"
              className={fieldClass}
            />
            <textarea
              name="notes"
              rows={3}
              placeholder="Preferences, timing flexibility, catering…"
              className={fieldClass}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <p className="text-[11px] text-muted-foreground">
              Availability is indicative only and subject to confirmation by our Private Aviation
              Team.
            </p>
            <DialogFooter>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-[0.3em] text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send to Concierge"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const fieldClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none";
