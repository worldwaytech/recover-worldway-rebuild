import type { ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

export function PageHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary">{eyebrow}</div>
      <h1 className="mt-2 font-serif text-3xl text-primary">{title}</h1>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
    </div>
  );
}

export function Panel({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-6" style={{ boxShadow: "var(--shadow-portal)" }}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl text-primary">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function NotConfigured({ what, note }: { what: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm">
      <div className="text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">Not configured</div>
      <div className="mt-1 text-foreground">{what}</div>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}

export function money(m: Record<string, number> | undefined) {
  const e = Object.entries(m ?? {});
  if (!e.length) return "—";
  return e.map(([c, v]) => `${c} ${Math.round(v).toLocaleString("en-IN")}`).join(" · ");
}

export const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useConsole<T>(key: string, fn: any, data?: unknown) {
  const call = useServerFn(fn) as (a?: unknown) => Promise<T>;
  return useQuery<T>({
    queryKey: ["admin-console", key, data ?? null],
    queryFn: () => call(data === undefined ? undefined : { data }),
    retry: false,
  });
}

export function QueryState({ q, children }: { q: { isLoading: boolean; error: unknown }; children: ReactNode }) {
  if (q.isLoading) return <Empty>Loading…</Empty>;
  if (q.error) return <p className="py-4 text-sm text-destructive">Could not load: {(q.error as Error).message}</p>;
  return <>{children}</>;
}
