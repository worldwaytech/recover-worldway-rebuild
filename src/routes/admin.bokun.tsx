import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  runBokunSmokeTest,
  syncBokunCatalogue,
  verifyBokunEnvironment,
} from "@/lib/bokun/bokun.functions";

export const Route = createFileRoute("/admin/bokun")({
  head: () => ({ meta: [{ title: "Bókun connector — Admin" }] }),
  component: AdminBokunPage,
});

function AdminBokunPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      const res = await fn();
      setOutput(JSON.stringify(res, null, 2));
    } catch (err) {
      setOutput(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Bókun + OCTO connector</h1>
      <p className="mt-2 text-muted-foreground">
        Credentials are stored server-side only. Bookings stay disabled until the environment is verified and
        explicitly enabled.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          disabled={busy !== null}
          onClick={() => run("verify", () => verifyBokunEnvironment({ data: undefined } as never))}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {busy === "verify" ? "Verifying…" : "Verify environment (read-only)"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => run("smoke", () => runBokunSmokeTest({ data: undefined } as never))}
          className="rounded-md border border-border bg-card px-4 py-2 text-foreground disabled:opacity-50"
        >
          {busy === "smoke" ? "Running…" : "Run read-only smoke test"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => run("sync", () => syncBokunCatalogue({ data: undefined } as never))}
          className="rounded-md border border-border bg-card px-4 py-2 text-foreground disabled:opacity-50"
        >
          {busy === "sync" ? "Syncing…" : "Sync catalogue"}
        </button>
      </div>
      {output && (
        <pre className="mt-6 max-h-[480px] overflow-auto rounded-xl border border-border bg-muted p-4 text-xs text-foreground">
          {output}
        </pre>
      )}
    </main>
  );
}
