import type { ReactNode } from "react";

export function ContentHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-background">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <div className="text-[11px] uppercase tracking-[0.4em] text-primary">{eyebrow}</div>
        <h1 className="mt-4 font-serif text-4xl leading-tight text-foreground md:text-5xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </section>
  );
}

export function ContentBody({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-16 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-serif text-xl text-foreground">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export const LEGAL_UPDATED = "1 August 2026";
