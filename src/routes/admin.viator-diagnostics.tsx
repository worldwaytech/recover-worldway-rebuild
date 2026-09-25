import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { exportViatorDiagnostics } from "@/lib/viator/diagnostics.functions";

export const Route = createFileRoute("/admin/viator-diagnostics")({
  head: () => ({
    meta: [
      { title: "Viator Diagnostic Export — Worldway Admin" },
      { name: "description", content: "Sanitized Viator booking-chain diagnostics for tech support." },
      { property: "og:title", content: "Viator Diagnostic Export — Worldway Admin" },
      { property: "og:description", content: "Sanitized Viator booking-chain diagnostics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ViatorDiagnosticsPage,
});

type Pkg = Awaited<ReturnType<typeof exportViatorDiagnostics>>;

function ViatorDiagnosticsPage() {
  const run = useServerFn(exportViatorDiagnostics);
  const [hours, setHours] = useState(72);
  const [cartRef, setCartRef] = useState("");
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setPkg(await run({ data: { hours, ...(cartRef.trim() ? { cartRef: cartRef.trim() } : {}) } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!pkg) return;
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `viator-diagnostics-${pkg.generatedAt.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Viator Diagnostic Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sanitized trace of availability → hold → payment form → booking → status, ready to send to
          Viator Tech Support. Keys, payment tokens, card data and personal details are removed.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-4">
        <label className="text-xs text-muted-foreground">
          Last hours
          <input
            type="number"
            min={1}
            max={720}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Math.min(720, Number(e.target.value) || 72)))}
            className="mt-1 block w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Cart reference (optional)
          <input
            value={cartRef}
            onChange={(e) => setCartRef(e.target.value)}
            className="mt-1 block w-64 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate package"}
        </button>
        <button
          onClick={download}
          disabled={!pkg}
          className="rounded-md border border-primary px-4 py-2 text-sm text-primary disabled:opacity-40"
        >
          Download JSON
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {pkg && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Environment" value={pkg.integration.environment} />
            <Stat label="Events" value={String(pkg.summary.totalEvents)} />
            <Stat label="Failures" value={String(pkg.summary.failures)} />
            <Stat label="First failure" value={pkg.summary.firstFailure?.step ?? "none"} />
          </div>
          {pkg.summary.firstFailure && (
            <div className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
              <p className="text-foreground">
                {pkg.summary.firstFailure.step} — HTTP {pkg.summary.firstFailure.httpStatus ?? "n/a"}
              </p>
              <p className="text-muted-foreground">{pkg.summary.firstFailure.error}</p>
              {pkg.summary.firstFailure.trackingId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracking ID: {pkg.summary.firstFailure.trackingId}
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2">Time (UTC)</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Step</th>
                  <th className="p-2">HTTP</th>
                  <th className="p-2">ms</th>
                  <th className="p-2">Cart</th>
                  <th className="p-2">Tracking / error</th>
                </tr>
              </thead>
              <tbody>
                {pkg.events.map((e, i) => (
                  <tr key={i} className="border-t border-border/40 text-foreground">
                    <td className="p-2 whitespace-nowrap">{e.at}</td>
                    <td className="p-2">{e.source}</td>
                    <td className="p-2">{e.step}</td>
                    <td className={`p-2 ${e.ok === false ? "text-destructive" : ""}`}>{e.httpStatus ?? "—"}</td>
                    <td className="p-2">{e.durationMs ?? "—"}</td>
                    <td className="p-2">{e.cartRef ?? "—"}</td>
                    <td className="p-2">{e.trackingId ?? e.error ?? ""}</td>
                  </tr>
                ))}
                {!pkg.events.length && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground">
                      No booking attempts recorded in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg text-foreground">{value}</p>
    </div>
  );
}
