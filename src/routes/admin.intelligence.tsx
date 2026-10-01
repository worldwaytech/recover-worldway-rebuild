import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatTile } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVerifiedRole } from "@/hooks/use-verified-role";
import { getIntelligenceOverview, runRecheckNow, saveContractedInventory, verifyContractedInventory } from "@/lib/admin/intelligence.functions";
import { PageHead, Panel, QueryState, Empty, NotConfigured, when, useConsole, adminHead } from "@/components/admin/console-ui";

export const Route = createFileRoute("/admin/intelligence")({
  head: adminHead("Trip intelligence", "Proposal decisions, confidence, price rechecks, risks, partner learning and contracted inventory."),
  component: Page,
});

type D = Awaited<ReturnType<typeof getIntelligenceOverview>>;
const pct = (n: unknown) => (typeof n === "number" ? `${Math.round(n * 100)}%` : "—");

function Inner() {
  const q = useConsole<D>("intel", getIntelligenceOverview);
  const qc = useQueryClient();
  const recheck = useServerFn(runRecheckNow);
  const verify = useServerFn(verifyContractedInventory);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-console", "intel"] });
  return (
    <QueryState q={q}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Decisions (latest 100)" value={String(d?.decisions.length ?? 0)} hint={`${d?.decisions.filter((x: any) => x.bookable).length ?? 0} bookable`} />
        <StatTile label="Need price recheck" value={String(d?.stale.length ?? 0)} />
        <StatTile label="Contracted items" value={String(d?.contracted.length ?? 0)} hint={`${d?.contracted.filter((x: any) => x.last_verified_at).length ?? 0} live-verified`} />
        <StatTile label="Post-booking changes" value={String(d?.changes.length ?? 0)} hint={`${d?.changes.filter((x: any) => x.status === "pending").length ?? 0} awaiting approval`} />
      </div>

      <Panel title="Proposal decisions" right={<span className="text-xs text-muted-foreground">Prices and availability come only from partners; AI never sets them.</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th>When</th><th>Alternative</th><th>Total</th><th>Confidence</th><th>Bookable</th><th>Channels</th><th>Risks</th><th>Recheck</th></tr></thead>
            <tbody>
              {(d?.decisions ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border/40 align-top">
                  <td className="py-2">{when(r.created_at)}</td>
                  <td>{r.label ?? "—"}</td>
                  <td>{r.total != null ? `${Number(r.total).toLocaleString()} ${r.currency}` : "No confirmed price"}</td>
                  <td>{pct(Number(r.min_confidence))}</td>
                  <td>{r.bookable ? "Yes" : "No"}</td>
                  <td className="text-xs">{(r.channels ?? []).map((c: any) => `${c.channel.toUpperCase()} ${c.ready ? "ready" : "not ready"}`).join(" · ")}</td>
                  <td className="text-xs">{(r.risks ?? []).map((k: any) => k.message).join("; ") || "None"}</td>
                  <td className="text-xs">{r.recheck_status ?? (r.recheck_due?.length ? `${r.recheck_due.length} due` : "Fresh")}{r.last_rechecked_at ? ` · ${when(r.last_rechecked_at)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!d?.decisions.length && <Empty>No proposals have been built yet.</Empty>}
      </Panel>

      <Panel title="Scheduled price rechecks" right={<Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await recheck(); toast.success(`Checked ${r.checked}, skipped ${r.skipped}, failed ${r.failed}`); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Run recheck now</Button>}>
        <p className="mb-2 text-xs text-muted-foreground">Each run checks at most 10 proposals and 20 partner prices, skipping anything checked in the last 30 minutes. It never books or changes a trip.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th>Started</th><th>Checked</th><th>Skipped</th><th>Failed</th><th>Note</th></tr></thead>
          <tbody>{(d?.runs ?? []).map((r: any) => <tr key={r.id} className="border-t border-border/40"><td className="py-2">{when(r.started_at)}</td><td>{r.checked}</td><td>{r.skipped}</td><td>{r.failed}</td><td>{r.note ?? (r.finished_at ? "" : "Running")}</td></tr>)}</tbody>
        </table>
        {!d?.runs.length && <Empty>No recheck runs yet.</Empty>}
      </Panel>

      <Panel title="Partners: certification, reliability and learning">
        <p className="mb-2 text-xs text-muted-foreground">Learning (last 30 days) adjusts ranking and confidence only — never prices or availability.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th>Partner</th><th>Products</th><th>Status</th><th>Reliability</th><th>Searches</th><th>Booked</th><th>Failed</th><th>Learned success</th></tr></thead>
          <tbody>{(d?.partners ?? []).map((p: any) => <tr key={p.key} className="border-t border-border/40"><td className="py-2">{p.key}</td><td>{p.kinds.join(", ")}</td><td>{p.status}</td><td>{pct(p.reliability)}</td><td>{p.learned?.searched ?? 0}</td><td>{p.learned?.booked ?? 0}</td><td>{p.learned?.failed ?? 0}</td><td>{p.learned ? pct(p.learned.bookingSuccess) : "—"}</td></tr>)}</tbody>
        </table>
        <div className="mt-3 text-xs text-muted-foreground">Bookings by product (30 days): {Object.entries(d?.bookings ?? {}).map(([k, v]) => `${k}: ${Object.entries(v).map(([s, n]) => `${s} ${n}`).join(", ")}`).join(" · ") || "none"}</div>
      </Panel>

      <ContractedPanel rows={d?.contracted ?? []} onSaved={refresh} onVerify={async (id) => { try { const r = await verify({ data: { id } }); toast[r.status === "confirmed" ? "success" : "warning"](`${r.status}: ${r.reason}`); refresh(); } catch (e) { toast.error((e as Error).message); } }} />

      <Panel title="Journey versions and post-booking changes">
        <div className="grid gap-6 md:grid-cols-2">
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th>Journey</th><th>Version</th><th>When</th></tr></thead>
            <tbody>{(d?.versions ?? []).map((v: any) => <tr key={`${v.journey_id}-${v.version}`} className="border-t border-border/40"><td className="py-2">{String(v.journey_id).slice(0, 8)}</td><td>v{v.version}</td><td>{when(v.created_at)}</td></tr>)}</tbody></table>
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th>Journey</th><th>Change</th><th>Price change</th><th>When</th></tr></thead>
            <tbody>{(d?.changes ?? []).map((s: any, i: number) => <tr key={i} className="border-t border-border/40"><td className="py-2">{String(s.journey_id).slice(0, 8)}</td><td>{s.status}{s.requires_approval ? " · needs approval" : ""}</td><td>{s.price_delta ?? "—"}</td><td>{when(s.created_at)}</td></tr>)}</tbody></table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Full change history and approvals are in the Journey console.</p>
      </Panel>
    </QueryState>
  );
}

const blank = { supplierKey: "", kind: "stay", externalId: "", title: "", place: "", timezone: "Asia/Kolkata", validFrom: "", validTo: "", netAmount: "", currency: "INR", refundable: false };

function ContractedPanel({ rows, onSaved, onVerify }: { rows: any[]; onSaved: () => void; onVerify: (id: string) => void }) {
  const save = useServerFn(saveContractedInventory);
  const [f, setF] = useState<Record<string, any>>(blank);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Panel title="Contracted inventory">
      <p className="mb-3 text-xs text-muted-foreground">Your own contracted stock is shown alongside live results. A live result always wins over a duplicate, and contracted items must pass a live check before they can be booked.</p>
      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" onSubmit={async (e) => {
        e.preventDefault();
        try { await save({ data: { ...f, netAmount: Number(f.netAmount), quality: null, active: true } as any }); toast.success("Saved — run a live check before it can be booked"); setF(blank); onSaved(); } catch (err) { toast.error((err as Error).message); }
      }}>
        <Input placeholder="Partner key" value={f.supplierKey} onChange={set("supplierKey")} required />
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.kind} onChange={set("kind")}>{["stay", "activity", "transfer", "flight", "cruise", "rail", "insurance"].map((k) => <option key={k}>{k}</option>)}</select>
        <Input placeholder="Partner product code" value={f.externalId} onChange={set("externalId")} required />
        <Input placeholder="Title" value={f.title} onChange={set("title")} required />
        <Input placeholder="Destination code (e.g. JAI)" value={f.place} onChange={set("place")} required />
        <Input placeholder="Timezone" value={f.timezone} onChange={set("timezone")} required />
        <Input type="date" value={f.validFrom} onChange={set("validFrom")} required />
        <Input type="date" value={f.validTo} onChange={set("validTo")} required />
        <Input type="number" min="0" step="0.01" placeholder="Net price" value={f.netAmount} onChange={set("netAmount")} required />
        <Input placeholder="Currency" maxLength={3} value={f.currency} onChange={set("currency")} required />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.refundable} onChange={(e) => setF({ ...f, refundable: e.target.checked })} /> Refundable</label>
        <Button type="submit">Add item</Button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th>Item</th><th>Type</th><th>Valid</th><th>Net</th><th>Live check</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t border-border/40"><td className="py-2">{r.title}<div className="text-xs text-muted-foreground">{r.supplier_key} · {r.place}</div></td><td>{r.kind}</td><td>{r.valid_from} → {r.valid_to}</td><td>{Number(r.net_amount).toLocaleString()} {r.currency}</td>
            <td className="text-xs">{r.last_verified_at ? `Verified ${when(r.last_verified_at)}` : r.verification_note ?? "Not checked"}</td>
            <td><Button size="sm" variant="outline" onClick={() => onVerify(r.id)}>Check live</Button></td></tr>
        ))}</tbody>
      </table>
      {!rows.length && <Empty>No contracted inventory yet.</Empty>}
    </Panel>
  );
}

function Page() {
  const v = useVerifiedRole(["super_admin", "admin"]);
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Intelligence" title="Trip intelligence" intro="Every proposal decision, its confidence, risks, channel readiness and live price rechecks." />
      {v === "allowed" ? <Inner /> : v === "checking" ? <Empty>Checking access…</Empty> : <NotConfigured what="Staff access required" />}
    </div>
  );
}
