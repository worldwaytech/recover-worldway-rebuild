import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { admin } from "@/lib/admin-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Worldway Travels Group" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = admin.settings();
  const [brandName, setBrandName] = useState(s.brandName);
  const [supportEmail, setSupportEmail] = useState(s.supportEmail);
  const [currency, setCurrency] = useState(s.currency);
  const [maintenance, setMaintenance] = useState(s.maintenance);
  const [saved, setSaved] = useState(false);

  function save() {
    admin.updateSettings({ brandName, supportEmail, currency, maintenance });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">Configuration</div>
        <h1 className="mt-2 font-serif text-3xl text-primary">Platform settings</h1>
      </div>
      <div
        className="grid gap-6 rounded-2xl border border-border/60 bg-card/60 p-6 md:grid-cols-2"
        style={{ boxShadow: "var(--shadow-portal)" }}
      >
        <div>
          <Label>Brand name</Label>
          <Input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label>Support email</Label>
          <Input
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label>Default currency</Label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
          >
            {["USD", "EUR", "GBP", "AED", "INR", "JPY"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end justify-between rounded-lg border border-border/60 bg-background/40 p-4">
          <div>
            <div className="text-sm font-medium">Maintenance mode</div>
            <div className="text-xs text-muted-foreground">
              Show a maintenance banner site-wide.
            </div>
          </div>
          <Switch checked={maintenance} onCheckedChange={setMaintenance} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save changes</Button>
        {saved && <span className="text-xs text-primary">Saved</span>}
      </div>
    </div>
  );
}
