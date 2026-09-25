import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  finishTtcSync,
  getCatalogueSyncOverview,
  runAktgSync,
  startTtcSync,
  stepTtcSync,
} from "@/lib/catalogue-sync/sync.functions";

type Overview = Awaited<ReturnType<typeof getCatalogueSyncOverview>>;
type Session = Overview["sessions"][number];

export const Route = createFileRoute("/admin/catalogue-sync")({
  head: () => ({
    meta: [
      { title: "AKTG & TTC catalogue sync — Worldway Admin" },
      {
        name: "description",
        content: "Run full AKTG journey and TTC tour synchronisation and review sync history.",
      },
    ],
  }),
  component: CatalogueSyncPage,
});

const STATS = ["discovered", "created", "updated", "unchanged", "deactivated", "failed"] as const;

function CatalogueSyncPage() {
  const load = useServerFn(getCatalogueSyncOverview);
  const aktg = useServerFn(runAktgSync);
  const ttcStart = useServerFn(startTtcSync);
  const ttcStep = useServerFn(stepTtcSync);
  const ttcFinish = useServerFn(finishTtcSync);

  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<"aktg" | "ttc" | null>(null);
  const [progress, setProgress] = useState("");
  const cancelRef = useRef(false);

  async function refresh() {
    try {
      setData((await load()) as Overview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load sync history.");
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onAktg() {
    setBusy("aktg");
    setProgress("Reading every journey from abercrombiekent.com…");
    try {
      const r = (await aktg()) as Awaited<ReturnType<typeof runAktgSync>>;
      toast.success(`AKTG: ${r.created} created, ${r.updated} updated, ${r.deactivated} deactivated.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AKTG sync failed.");
    } finally {
      setBusy(null);
      setProgress("");
      await refresh();
    }
  }

  async function onTtc() {
    setBusy("ttc");
    cancelRef.current = false;
    let sessionId: string | null = null;
    try {
      const s = (await ttcStart()) as { id: string; brands: string[] };
      sessionId = s.id;
      for (const brand of s.brands) {
        let cursor: string | null = null;
        let done = false;
        let processed = 0;
        while (!done && !cancelRef.current) {
          setProgress(`${brand}: ${processed} tours processed…`);
          const chunk = (await ttcStep({ data: { sessionId, brand, cursor } })) as Awaited<
            ReturnType<typeof stepTtcSync>
          >;
          processed += chunk.created + chunk.updated + chunk.unchanged + chunk.failed;
          cursor = chunk.cursor;
          done = chunk.done;
          if (chunk.error) toast.error(`${brand}: ${chunk.error}`);
        }
        await refresh();
        if (cancelRef.current) break;
      }
      await ttcFinish({ data: { sessionId, cancelled: cancelRef.current } });
      toast.success(cancelRef.current ? "TTC sync stopped." : "TTC sync finished.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "TTC sync failed.");
      if (sessionId) await ttcFinish({ data: { sessionId, cancelled: true } }).catch(() => null);
    } finally {
      setBusy(null);
      setProgress("");
      await refresh();
    }
  }

  const sessions = data?.sessions ?? [];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Catalogue sync</p>
          <h1 className="text-2xl font-semibold">AKTG & TTC full synchronisation</h1>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </header>
      {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <SyncCard
          title="AKTG SYNC"
          subtitle="All journeys, categories, destinations and detail pages from abercrombiekent.com → /all-journeys"
          totals={data?.totals.aktg}
          sessions={sessions.filter((s) => s.provider === "aktg")}
          action={
            <Button onClick={() => void onAktg()} disabled={busy !== null}>
              {busy === "aktg" ? "Syncing…" : "AKTG SYNC"}
            </Button>
          }
        />
        <SyncCard
          title="TTC SYNC"
          subtitle="Every TTC Group brand, collection, destination and tour page → /ttc"
          totals={data?.totals.ttc}
          sessions={sessions.filter((s) => s.provider === "ttc")}
          action={
            busy === "ttc" ? (
              <Button variant="outline" onClick={() => (cancelRef.current = true)}>
                Stop after current step
              </Button>
            ) : (
              <Button onClick={() => void onTtc()} disabled={busy !== null}>
                TTC SYNC
              </Button>
            )
          }
        />
      </div>
    </div>
  );
}

function SyncCard(props: {
  title: string;
  subtitle: string;
  totals: { active: number; inactive: number } | undefined;
  sessions: Session[];
  action: React.ReactNode;
}) {
  const last = props.sessions[0];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{props.title}</CardTitle>
          <p className="text-xs text-muted-foreground">{props.subtitle}</p>
          {props.totals ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {props.totals.active.toLocaleString()} active · {props.totals.inactive.toLocaleString()} inactive
            </p>
          ) : null}
        </div>
        {props.action}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {STATS.map((k) => (
            <div key={k} className="rounded-md border border-border p-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{k}</p>
              <p className="text-lg font-semibold">{last ? last[k].toLocaleString() : "—"}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Last sync:{" "}
          {last ? (
            <>
              {new Date(last.startedAt).toLocaleString()} <Badge variant="outline">{last.status}</Badge>
            </>
          ) : (
            "never"
          )}
          {last?.error ? <span className="block text-destructive">{last.error}</span> : null}
        </p>
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs font-medium">Sync history</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Started</th>
                <th>Status</th>
                <th>Disc.</th>
                <th>New</th>
                <th>Upd.</th>
                <th>Same</th>
                <th>Deact.</th>
                <th>Fail</th>
              </tr>
            </thead>
            <tbody>
              {props.sessions.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-1">{new Date(s.startedAt).toLocaleString()}</td>
                  <td>{s.status}</td>
                  <td>{s.discovered}</td>
                  <td>{s.created}</td>
                  <td>{s.updated}</td>
                  <td>{s.unchanged}</td>
                  <td>{s.deactivated}</td>
                  <td>{s.failed}</td>
                </tr>
              ))}
              {props.sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-2 text-muted-foreground">
                    No syncs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
