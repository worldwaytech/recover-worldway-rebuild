import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { admin } from "@/lib/admin-store";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/content")({
  head: () => ({ meta: [{ title: "Content & Flags — Worldway Travels Group" }] }),
  component: ContentPage,
});

function ContentPage() {
  const [tick, setTick] = useState(0);
  void tick;
  const flags = admin.flags();
  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Platform</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Content & Feature Flags</h1>
        <p className="text-sm text-muted-foreground">
          Toggle products and gated experiences globally.
        </p>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <ul className="divide-y divide-border/40">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center justify-between p-5">
              <div>
                <div className="text-sm font-medium text-foreground">{f.label}</div>
                <div className="text-xs text-muted-foreground">
                  {f.key}
                  {f.note ? ` · ${f.note}` : ""}
                </div>
              </div>
              <Switch
                checked={f.enabled}
                onCheckedChange={() => {
                  admin.toggleFlag(f.key);
                  setTick((t) => t + 1);
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
