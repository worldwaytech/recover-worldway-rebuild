import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode, ElementType } from "react";

// TODO(Lovable Cloud): every portal surface below requires an authenticated
// Supabase session. When Cloud is enabled, wrap under /_authenticated with
// requireSupabaseAuth + has_role gating for admin/agent surfaces.

export interface PortalTile {
  icon: ElementType;
  title: string;
  text: string;
  to?: string;
}

export interface PortalNavItem {
  label: string;
  to: string;
  exact?: boolean;
}

export function PortalShell({
  title,
  eyebrow,
  intro,
  tiles,
  nav,
  children,
}: {
  title: string;
  eyebrow: string;
  intro: string;
  tiles?: PortalTile[];
  nav?: PortalNavItem[];
  children?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <main className="pt-24">
      <section className="container-lux py-12">
        <p className="eyebrow text-gold">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-5xl md:text-6xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{intro}</p>
        <div className="mt-4 inline-flex rounded-sm border border-dashed border-gold/50 bg-gold/5 px-3 py-1.5 text-[0.65rem] uppercase tracking-widest text-gold">
          TODO(Lovable Cloud) · activates with backend
        </div>

        {nav && nav.length > 0 && (
          <nav aria-label="Portal navigation" className="mt-8 border-b border-border">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-widest">
              {nav.map((n) => {
                const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
                return (
                  <li key={n.to}>
                    <Link
                      to={n.to}
                      className={`inline-block py-3 border-b-2 -mb-px transition-colors ${
                        active
                          ? "border-gold text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {tiles && tiles.length > 0 && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => {
              const inner = (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-gold/15 text-gold">
                    <t.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-serif text-xl">{t.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t.text}</p>
                </>
              );
              const cls =
                "block rounded-sm border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-elegant";
              return t.to ? (
                <Link key={t.title} to={t.to} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={t.title} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}

        {children && <div className="mt-10">{children}</div>}

        <div className="mt-12">
          <Link to="/" className="text-xs uppercase tracking-widest text-gold">
            ← Back to Worldway Luxe
          </Link>
        </div>
      </section>
    </main>
  );
}
