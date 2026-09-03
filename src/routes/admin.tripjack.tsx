import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Download, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TRIPJACK_CERTIFICATION_STATUSES, type TripjackCertificationStatus } from "@/lib/tripjack/config";
import {
  exportTripjackEvidence,
  getTripjackCertification,
  updateTripjackCertificationCase,
} from "@/lib/tripjack/tripjack.functions";

type Overview = Awaited<ReturnType<typeof getTripjackCertification>>;
type CaseView = Overview["cases"][number];

export const Route = createFileRoute("/admin/tripjack")({
  head: () => ({
    meta: [
      { title: "TripJack UAT certification — Worldway Admin" },
      {
        name: "description",
        content: "Cabs and TripSafe UAT connectivity, documented certification checklist, confirmation-number tracking and request/response evidence export.",
      },
    ],
  }),
  component: TripjackConsole,
});

// ─── Minimal store-only ZIP writer (no dependency) ───────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files: Array<{ name: string; content: string }>): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" });
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_TONE: Record<TripjackCertificationStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-secondary text-secondary-foreground",
  passed: "bg-primary text-primary-foreground",
  failed: "bg-destructive text-destructive-foreground",
  blocked: "bg-accent text-accent-foreground",
};

function CaseRow({ c, onSaved }: { c: CaseView; onSaved: () => Promise<void> }) {
  const save = useServerFn(updateTripjackCertificationCase);
  const exportFn = useServerFn(exportTripjackEvidence);
  const [status, setStatus] = useState<TripjackCertificationStatus>(c.status);
  const [supplierBookingId, setSupplierBookingId] = useState(c.supplierBookingId ?? "");
  const [confirmations, setConfirmations] = useState(c.confirmationNumbers.join(", "));
  const [correlations, setCorrelations] = useState(c.correlationIds.join(", "));
  const [notes, setNotes] = useState(c.notes ?? "");
  const [busy, setBusy] = useState(false);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function onSave() {
    setBusy(true);
    try {
      await save({
        data: {
          caseKey: c.key,
          status,
          supplierBookingId: supplierBookingId || null,
          confirmationNumbers: split(confirmations),
          correlationIds: split(correlations),
          notes: notes || null,
          worldwayBookingId: c.worldwayBookingId ?? null,
        },
      });
      toast.success(`${c.key} saved.`);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setBusy(true);
    try {
      const r = await exportFn({ data: { caseKey: c.key } });
      if (!r.files.length) {
        toast.warning("No evidence recorded yet — add the supplier booking id or correlation ids and save first.");
        return;
      }
      download(makeZip(r.files), `tripjack-${c.key}-evidence.zip`);
      toast.success(`${r.count} supplier call(s) exported as ${r.files.length} JSON files.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{c.key}</span>
          <Badge className={STATUS_TONE[c.status]}>{c.status.replace("_", " ")}</Badge>
          {c.optional && <Badge variant="outline">optional</Badge>}
          <Badge variant="outline">{c.evidenceCount} evidence row{c.evidenceCount === 1 ? "" : "s"}</Badge>
        </div>
        <p className="mt-1 text-sm font-medium">{c.title}</p>
        <p className="text-xs text-muted-foreground">{c.section} · {c.capabilities.join(" → ")}</p>
      </div>
      <div className="space-y-2">
        <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as TripjackCertificationStatus)}>
          {TRIPJACK_CERTIFICATION_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <Input placeholder="Supplier booking id (TJS…)" value={supplierBookingId} onChange={(e) => setSupplierBookingId(e.target.value)} />
        <Input placeholder="Confirmation numbers / policy ids, comma-separated" value={confirmations} onChange={(e) => setConfirmations(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Input placeholder="Correlation ids, comma-separated" value={correlations} onChange={(e) => setCorrelations(e.target.value)} />
        <Input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Button size="sm" onClick={onSave} disabled={busy}>Save</Button>
        <Button size="sm" variant="outline" onClick={onExport} disabled={busy}><Download className="mr-1 h-3.5 w-3.5" /> Evidence</Button>
      </div>
    </div>
  );
}

function TripjackConsole() {
  const load = useServerFn(getTripjackCertification);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh(connectivity = false) {
    setLoading(true);
    try {
      setData((await load({ data: { connectivity } })) as Overview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the TripJack console.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suites = ["cabs", "tripsafe"] as const;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">TripJack UAT certification</h1>
          <p className="text-sm text-muted-foreground">
            Cabs v2 · TripSafe v5.1 · environment <span className="uppercase">{data?.environment ?? "—"}</span> · {data?.baseUrl}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
            <Activity className="mr-2 h-4 w-4" /> Run connectivity check
          </Button>
          <Button variant="outline" onClick={() => void refresh(false)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Credential</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-sm">{data?.credentialConfigured ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}{data?.credentialConfigured ? "TRIPJACK_UAT_API_KEY configured (server-only)" : "Not configured"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Cases passed</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.totals.passed ?? 0}<span className="text-sm text-muted-foreground"> / {data?.totals.cases ?? 0}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Blocked</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.totals.blocked ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Evidence rows</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.totals.evidenceRows ?? 0}</CardContent></Card>
      </div>

      {data?.connectivity && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.connectivity.map((c) => (
            <Card key={c.suite}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="uppercase">{c.suite}</span>
                  <Badge className={c.state === "LIVE" ? STATUS_TONE.passed : c.state === "SUPPLIER-SIDE BLOCKED" ? STATUS_TONE.blocked : STATUS_TONE.failed}>{c.state}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>{c.detail}</p>
                <p className="text-xs text-muted-foreground">HTTP {c.httpStatus ?? "—"} · {c.correlationId ?? "no call"} · {new Date(c.checkedAt).toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {suites.map((suite) => (
        <Card key={suite}>
          <CardHeader><CardTitle className="text-base">{suite === "cabs" ? "Cabs — UAT test cases (doc §4.1–4.5)" : "TripSafe — UAT test matrix"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data?.cases ?? []).filter((c) => c.suite === suite).map((c) => (
              <CaseRow key={`${c.key}-${c.updatedAt ?? ""}`} c={c} onSaved={() => refresh(false)} />
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle className="text-base">Recent supplier calls (evidence log)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-3">Time</th><th className="pr-3">Suite</th><th className="pr-3">Capability</th><th className="pr-3">HTTP</th><th className="pr-3">Outcome</th><th className="pr-3">Booking id</th><th>Correlation id</th></tr>
              </thead>
              <tbody>
                {(data?.recentLogs ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(l.at).toLocaleString()}</td>
                    <td className="pr-3 uppercase">{l.suite}</td>
                    <td className="pr-3">{l.method} {l.capability}</td>
                    <td className="pr-3">{l.status ?? "—"}</td>
                    <td className="pr-3">{l.outcome}{l.errorKind ? ` (${l.errorKind})` : ""}</td>
                    <td className="pr-3 font-mono">{l.supplierBookingId ?? ""}</td>
                    <td className="font-mono">{l.correlationId}</td>
                  </tr>
                ))}
                {!data?.recentLogs?.length && <tr><td colSpan={7} className="py-3 text-muted-foreground">No supplier calls recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">TripJack certification checklist (from the supplier documentation)</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Server egress IPv4 and contact email whitelisted in the TripJack portal; API key generated with <strong>both</strong> Cabs and TripSafe products enabled.</li>
            <li>Cabs §4.1–4.3: six bookings (one-way ×3 with 3 travellers, pickup = today + 2 days; round-trip ×3 with 2 travellers, return 1–2 days later) plus Payment and Booking Details. §4.5 embedded is optional.</li>
            <li>TripSafe: searches (single-trip, multi-traveller, Student, AMT) and bookings incl. Student 180/365-day and AMT 30/60-day, Review → Book → Booking Details (policyId), plus one Raise/Confirm cancellation ≥ 24h before cover.</li>
            <li>Real passenger names on every booking — “TBA” / “Test” fail certification.</li>
            <li>Evidence: unmodified JSON, one file per request and per response (exported here), confirmation numbers recorded per case, API key attached separately.</li>
            <li>TripJack verification (1–2 working days) → sign-off → production credentials and wallet funding for <code>paymentMedium: WALLET</code>.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
