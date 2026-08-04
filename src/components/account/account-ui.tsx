import type { ReactNode } from "react";

export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-primary">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
      <div className="text-sm text-foreground">{title}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/50 rounded-xl border border-border/60">{children}</div>
  );
}

export function Row({
  title,
  meta,
  right,
}: {
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{title}</div>
        {meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {right}
    </div>
  );
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
