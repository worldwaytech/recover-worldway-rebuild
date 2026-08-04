import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountApi, type NotificationPrefs } from "@/lib/account-data";
import { Panel, EmptyState } from "@/components/account/account-ui";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/account/notifications")({
  head: () => ({
    meta: [
      { title: "Notification preferences — Worldway Travels Group" },
      {
        name: "description",
        content: "Choose how Worldway reaches you about trips, offers and alerts.",
      },
      { property: "og:title", content: "Notification preferences — Worldway Travels Group" },
      {
        property: "og:description",
        content: "Choose how Worldway reaches you about trips, offers and alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Notifications,
});

const FIELDS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "email_enabled", label: "Email", hint: "Confirmations, itineraries and receipts." },
  { key: "sms_enabled", label: "SMS", hint: "Time-critical travel alerts." },
  { key: "whatsapp_enabled", label: "WhatsApp", hint: "Concierge messages on the move." },
  { key: "trip_alerts", label: "Trip alerts", hint: "Gate changes, delays and document expiry." },
  { key: "marketing_enabled", label: "Offers & journals", hint: "Curated fares and new journeys." },
];

function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["account", "prefs"],
    queryFn: accountApi.prefs,
  });

  const save = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => accountApi.savePrefs(patch),
    onSuccess: (next) => {
      qc.setQueryData(["account", "prefs"], next);
      toast.success("Preferences updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel title="Notifications" description="Applies to every Worldway product and portal.">
      {isLoading || !data ? (
        <EmptyState title="Loading preferences…" />
      ) : (
        <div className="divide-y divide-border/50 rounded-xl border border-border/60">
          {FIELDS.map((f) => (
            <div key={String(f.key)} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <Label htmlFor={String(f.key)} className="text-sm text-foreground">
                  {f.label}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.hint}</p>
              </div>
              <Switch
                id={String(f.key)}
                checked={Boolean(data[f.key])}
                disabled={save.isPending}
                onCheckedChange={(v) => save.mutate({ [f.key]: v } as Partial<NotificationPrefs>)}
              />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
