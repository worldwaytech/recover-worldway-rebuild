import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { portal, type PortalUser } from "@/lib/portal-store";
import { LogOut, Wallet, Sparkles } from "lucide-react";

type NavItem = { to: string; label: string; icon?: ReactNode };

export function PortalShell({
  user,
  label,
  nav,
  hero,
  children,
  compact,
}: {
  user: PortalUser;
  label: string;
  nav?: NavItem[];
  hero?: { kicker?: string; title: string; subtitle?: string; actions?: ReactNode };
  children: ReactNode;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen text-foreground" style={{ background: "var(--gradient-portal)" }}>
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 font-serif tracking-widest text-primary">
            <span
              className="grid h-8 w-8 place-items-center rounded-full text-[0.65rem] font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-gold)" }}
            >
              W
            </span>
            <span className="hidden sm:inline">
              WORLDWAY <span className="text-foreground">TRAVELS GROUP</span>
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
              {label}
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              to="/wallet"
              className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary md:inline-flex"
            >
              <Wallet className="h-3.5 w-3.5" /> Wallet
            </Link>
            <span className="hidden text-xs text-muted-foreground md:inline">{user.email}</span>
            <button
              onClick={() => {
                portal.signOut();
                navigate({ to: "/auth" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {hero && (
        <section className="border-b border-border/40">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-14">
            <div className="max-w-2xl">
              {hero.kicker && (
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> {hero.kicker}
                </div>
              )}
              <h1 className="mt-3 font-serif text-4xl leading-tight text-primary md:text-5xl">
                {hero.title}
              </h1>
              {hero.subtitle && (
                <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                  {hero.subtitle}
                </p>
              )}
            </div>
            {hero.actions && <div className="flex flex-wrap gap-3">{hero.actions}</div>}
          </div>
        </section>
      )}

      <div
        className={`mx-auto max-w-7xl px-6 ${compact ? "py-8" : "py-12"} ${
          nav ? "grid gap-8 md:grid-cols-[220px_1fr]" : ""
        }`}
      >
        {nav && (
          <aside className="space-y-1">
            {nav.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-background/40 hover:text-primary"
                  }`}
                >
                  {n.icon}
                  {n.label}
                </Link>
              );
            })}
          </aside>
        )}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

export function PortalCard({
  title,
  description,
  to,
  icon,
  accent,
}: {
  title: string;
  description: string;
  to: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 transition hover:border-primary/50"
      style={accent ? { boxShadow: "var(--shadow-glow)" } : undefined}
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-0 blur-3xl transition group-hover:opacity-40"
        style={{ background: "var(--gradient-gold)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
        <span className="text-xs uppercase tracking-widest text-muted-foreground transition group-hover:text-primary">
          Open →
        </span>
      </div>
      <div className="relative mt-4">
        <div className="font-serif text-lg text-primary">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-5">
      <div className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl text-primary">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
