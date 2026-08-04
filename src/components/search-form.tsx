import { useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Field, ResultsPanel, SearchCard } from "./search-shell";
import { portal } from "@/lib/portal-store";
import { MembershipUpgradeDialog } from "./membership-upgrade-dialog";

type ServerFn<T> = (args: { data: Record<string, unknown> }) => Promise<T>;
type PartnerResult = { ok: boolean; status: number; error?: string; data?: unknown };

export function SearchForm({
  fn,
  buildPayload,
  children,
  submitLabel = "Search",
  title,
  requireSession = false,
}: {
  fn: ServerFn<PartnerResult>;
  buildPayload: (form: FormData) => Record<string, unknown>;
  children: ReactNode;
  submitLabel?: string;
  title?: string;
  requireSession?: boolean;
}) {
  const runSearch = useServerFn(fn);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [gateOpen, setGateOpen] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    window.dispatchEvent(new Event("wwtg:search-submit"));
    if (requireSession && !portal.session()) {
      setGateOpen(true);
      return;
    }
    if (!portal.canSearch()) {
      setGateOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const payload = buildPayload(new FormData(e.currentTarget));
      const res = await runSearch({ data: payload });
      if (!res.ok) setError(res.error ?? "Request failed");
      else {
        portal.recordSearch();
        setData(res.data ?? { message: "Request completed." });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SearchCard title={title}>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{children}</div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Requesting…" : submitLabel}
            </button>
          </div>
        </form>
      </SearchCard>
      <ResultsPanel loading={loading} error={error} data={data} />
      <MembershipUpgradeDialog open={gateOpen} onOpenChange={setGateOpen} reason="search" />
    </>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none";

export { Field };
