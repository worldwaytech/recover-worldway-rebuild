import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  image,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="text-xs uppercase tracking-[0.4em] text-primary">{eyebrow}</div>
        <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-tight text-foreground md:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">{subtitle}</p>
      </div>
    </section>
  );
}

export function SearchCard({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="mx-auto -mt-16 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        {title ? (
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">{title}</div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ResultsPanel({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: unknown;
}) {
  return (
    <section className="mx-auto mt-10 max-w-6xl px-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.3em] text-primary">Results</div>
          {loading ? <div className="text-xs text-muted-foreground">Loading…</div> : null}
        </div>
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}
        {!error && data ? (
          <pre className="max-h-[520px] overflow-auto rounded-lg bg-background/60 p-4 text-xs text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : null}
        {!error && !data && !loading ? (
          <div className="text-sm text-muted-foreground">
            Submit the search to see live results.
          </div>
        ) : null}
      </div>
    </section>
  );
}
