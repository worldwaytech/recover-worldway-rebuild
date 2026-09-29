import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useSyncExternalStore, useState, useRef, useEffect } from "react";
import logoAsset from "@/assets/worldway-logo.jpeg.asset.json";
import { portal } from "@/lib/portal-store";
import { mediaUrl } from "@/lib/media";

type NavChild = { to: string; label: string } | { label: string; children: { to: string; label: string }[] };
type NavItem = { to: string; label: string } | { label: string; children: NavChild[] };

const NAV: NavItem[] = [
  {
    label: "Flights",
    children: [
      { to: "/flights", label: "Flight Search" },
      { to: "/pre-purchased-flights", label: "Pre-Purchased" },
    ],
  },
  { to: "/hotels", label: "Hotels" },
  {
    label: "Voyages",
    children: [
      { to: "/voyages/cruisea", label: "Cruisea" },
      { to: "/cruises", label: "Luxury Cruises" },

      { to: "/expedition-cruises", label: "Expedition Cruises" },
      { to: "/river-cruises", label: "River Cruises" },
      { to: "/world-cruises", label: "World Cruises" },
      { to: "/crystal-cruises", label: "Worldway Luxury Cruises" },
      { to: "/rail", label: "Luxury Rail" },
      { to: "/yachts", label: "Yacht Charters" },
    ],
  },
  {
    label: "Journeys",
    children: [
      { to: "/all-journeys", label: "All Journeys" },
      { to: "/small-group", label: "Small Group" },
      { to: "/tailor-made", label: "Tailor-Made" },
      { to: "/safari", label: "Safari" },
      { to: "/polar-expeditions", label: "Polar Expeditions" },
      { to: "/cultural", label: "Cultural & Heritage" },
      { to: "/honeymoon", label: "Honeymoon" },
      { to: "/wellness", label: "Wellness" },
      { to: "/family", label: "Family" },
      { to: "/villas", label: "Villas & Estates" },
    ],
  },
  {
    label: "Experiences",
    children: [
      { to: "/tours", label: "Tours" },
      { to: "/ttc", label: "Guided Journeys" },
      { to: "/tours/browse", label: "Browse Collections" },
      {
        label: "Trip",
        children: [
          { to: "/trip/cabservices", label: "Cab Services" },
          { to: "/trip/tripsafeservices", label: "Travel Protection" },
        ],
      },
      { to: "/activities", label: "Activities" },
      { to: "/marketplace", label: "Tours Marketplace" },
      { to: "/merchant", label: "Merchant" },
      { to: "/transfers", label: "Transfers" },
      { to: "/buses", label: "Coach & Bus" },
      { to: "/trip-builder", label: "Trip Builder" },
      { to: "/insurance", label: "Travel Insurance" },
      { to: "/visa", label: "Visa Services" },
    ],
  },
  {
    label: "Private Aviation",
    children: [
      { to: "/private-jets", label: "Private Jets" },
      { to: "/private-aviation/empty-legs", label: "Empty Legs" },
    ],
  },
  { to: "/concierge", label: "Concierge" },
  { to: "/membership", label: "Membership" },
];

const linkClass =
  "group relative whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-300 hover:text-primary after:pointer-events-none after:absolute after:bottom-0 after:left-3 after:right-3 after:h-px after:origin-center after:scale-x-0 after:bg-gradient-to-r after:from-transparent after:via-primary after:to-transparent after:opacity-0 after:transition-all after:duration-500 hover:after:scale-x-100 hover:after:opacity-100";

function NavDropdown({ item }: { item: Extract<NavItem, { children: NavChild[] }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={linkClass + " inline-flex items-center gap-1"}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {item.label}
        <svg width="7" height="7" viewBox="0 0 10 10" aria-hidden className="opacity-70">
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-50 mt-1 min-w-[210px] -translate-x-1/2 rounded-md border border-border/60 bg-background/95 py-2 shadow-lg backdrop-blur-xl"
        >
          {item.children.map((c) =>
            "to" in c ? (
              <Link
                key={c.to}
                to={c.to}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                activeProps={{ className: "text-primary" }}
              >
                {c.label}
              </Link>
            ) : (
              <div key={c.label} className="mt-1 border-t border-border/50 pt-1">
                <span className="block px-4 py-1 text-[9px] uppercase tracking-[0.24em] text-primary/70">
                  {c.label}
                </span>
                {c.children.map((g) => (
                  <Link
                    key={g.to}
                    to={g.to}
                    onClick={() => setOpen(false)}
                    className="block px-6 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    activeProps={{ className: "text-primary" }}
                  >
                    {g.label}
                  </Link>
                ))}
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const nav = useNavigate();
  const session = useSyncExternalStore(
    (cb) => portal.subscribe(cb),
    () => portal.session(),
    () => null,
  );
  const roleHome =
    session?.role === "super_admin"
      ? "/admin/super"
      : session?.role === "admin"
        ? "/admin"
        : session?.role === "agent"
          ? "/agent"
          : session?.role === "b2b"
            ? "/b2b"
            : "/b2c";
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <Link
          to="/"
          aria-label="Worldway Travels Group home"
          className="mr-auto flex shrink-0 items-center gap-3 font-serif text-primary lg:mr-8"
        >
          <img
            src={mediaUrl(logoAsset.url)}
            alt="Worldway Travels Group logo"
            className="h-10 w-10 rounded-full object-cover ring-1 ring-primary/40 shadow-[0_0_18px_-6px_oklch(0.82_0.13_85/0.55)]"
          />
          <span className="flex flex-col leading-tight whitespace-nowrap">
            <span className="font-serif text-[0.95rem] tracking-[0.24em] text-primary">
              WORLDWAY
            </span>
            <span className="text-[0.55rem] uppercase tracking-[0.44em] text-muted-foreground">
              Travels Group
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) =>
            "to" in item ? (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "text-primary after:scale-x-100 after:opacity-100" }}
                className={linkClass}
              >
                {item.label}
              </Link>
            ) : (
              <NavDropdown key={item.label} item={item} />
            ),
          )}
        </nav>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <Link
            to="/search"
            search={{ q: "" }}
            aria-label="Search the Worldway catalogue"
            className="rounded-full border border-primary/25 p-2 text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <Search className="h-3.5 w-3.5" />
          </Link>
          {session ? (
            <>
              <Link
                to={roleHome}
                className="max-w-[7rem] truncate rounded-full border border-primary/30 px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] text-primary/90 transition-colors hover:bg-primary/10"
              >
                {session.name || session.email}
              </Link>
              <button
                onClick={async () => {
                  await portal.signOut();
                  nav({ to: "/" });
                }}
                className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-full border border-primary/40 px-4 py-1.5 text-[9px] uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
