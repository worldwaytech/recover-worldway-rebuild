import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

const TABS = [
  { to: "/hotels", label: "Live Search", exact: true },
  { to: "/hotels/hbx", label: "Live Hotels", exact: false },
] as const;

export const Route = createFileRoute("/hotels")({
  component: HotelsLayout,
});

function HotelsLayout() {
  return (
    <div>
      <nav
        aria-label="Hotels sections"
        className="border-b border-border/60 bg-background/80 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl gap-2 px-6 py-3">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.exact }}
              className="rounded-full px-5 py-2 text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
