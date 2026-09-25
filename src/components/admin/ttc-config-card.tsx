import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTtcConfigStatus, saveTtcTapId } from "@/lib/ttc/ttc-config.functions";

type Status = Awaited<ReturnType<typeof getTtcConfigStatus>>;

const FUTURE_LABELS: Record<string, string> = {
  TTC_API_TOKEN: "API token",
  TTC_CLIENT_ID: "Client ID",
  TTC_AGENT_ID: "Agent ID",
};

export function TtcConfigCard() {
  const load = useServerFn(getTtcConfigStatus);
  const save = useServerFn(saveTtcTapId);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tapId, setTapId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load()
      .then((s) => setStatus(s as Status))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load configuration."));
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await save({ data: { tapId } });
      setStatus(result as Status);
      setTapId("");
      if ((result as { verified: boolean }).verified) toast.success("TAP ID saved and verified.");
      else toast.error("TAP ID saved but verification failed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the TAP ID.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TTC configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">TAP ID:</span>
          {status?.tapId.configured ? (
            <>
              <Badge>Configured</Badge>
              <span className="font-mono text-muted-foreground">{status.tapId.masked}</span>
              {status.tapId.updatedAt ? (
                <span className="text-xs text-muted-foreground">
                  saved {new Date(status.tapId.updatedAt).toLocaleString()}
                </span>
              ) : null}
            </>
          ) : (
            <Badge variant="outline">{status ? "Not configured" : "…"}</Badge>
          )}
        </div>
        <form onSubmit={onSave} className="flex flex-wrap items-end gap-3" autoComplete="off">
          <div className="space-y-1">
            <Label htmlFor="ttc-tap-id">{status?.tapId.configured ? "Replace TAP ID" : "TAP ID"}</Label>
            <Input
              id="ttc-tap-id"
              type="password"
              value={tapId}
              onChange={(e) => setTapId(e.target.value)}
              placeholder="Enter TTC TAP ID"
              className="w-64"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={saving || tapId.trim().length < 2}>
            {saving ? "Saving…" : "Save TAP ID"}
          </Button>
        </form>
        <div className="space-y-2">
          <p className="text-sm font-medium">Future TTC API credentials</p>
          <p className="text-xs text-muted-foreground">
            Inactive until TTC issues API credentials. They will be stored as secure server secrets.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {(status?.futureCredentials ?? []).map((c) => (
              <div key={c.name} className="space-y-1">
                <Label className="text-xs">{FUTURE_LABELS[c.name] ?? c.name}</Label>
                <Input disabled placeholder="Awaiting TTC" />
                <Badge variant="outline" className="text-[10px]">
                  {c.present ? "Present · inactive" : "Inactive"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
