import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, ChevronDown, User, Sparkles } from "lucide-react";
import { regions, categories } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const journeyMenu = categories.slice(0, 7);

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<null | "destinations" | "journeys">(null);
  const { agent } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || mobileOpen || openMenu !== null;

  const linkClass = `relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] transition-all duration-200 hover:text-gold ${
    solid ? "hover:bg-foreground/[0.05]" : "hover:bg-primary-foreground/10"
  }`;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid
          ? "bg-sand/95 backdrop-blur-md shadow-soft text-foreground"
          : "bg-transparent text-primary-foreground"
      }`}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div className="mx-auto grid h-20 w-full max-w-[110rem] grid-cols-[auto_1fr_auto] items-center gap-3 px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5"
          onClick={() => setMobileOpen(false)}
          aria-label="Worldway Luxe home"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-gold-foreground font-serif text-xl shadow-gold">
            W
          </div>
          <span className="flex flex-col leading-none">
            <span className="font-serif text-lg tracking-tight xl:text-xl">Worldway Luxe</span>
            <span className="mt-1 text-[0.5rem] uppercase tracking-[0.28em] text-gold">
              Luxury Journeys
            </span>
          </span>
        </Link>

        <nav className="hidden min-w-0 items-center justify-center gap-1 xl:flex" aria-label="Primary">
          <div onMouseEnter={() => setOpenMenu("destinations")} className="flex shrink-0 items-center">
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={openMenu === "destinations"}
              onClick={() => setOpenMenu(openMenu === "destinations" ? null : "destinations")}
              className={`flex items-center gap-1 ${linkClass}`}
            >
              Destinations <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </div>
          <div onMouseEnter={() => setOpenMenu("journeys")} className="flex shrink-0 items-center">
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={openMenu === "journeys"}
              onClick={() => setOpenMenu(openMenu === "journeys" ? null : "journeys")}
              className={`flex items-center gap-1 ${linkClass}`}
            >
              Journeys <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </div>
          <Link to="/journeys" className={linkClass} onMouseEnter={() => setOpenMenu(null)}>
            All Journeys
          </Link>
          <Link to="/blog" className={linkClass} onMouseEnter={() => setOpenMenu(null)}>
            Inspiration
          </Link>
          <Link to="/about" className={linkClass} onMouseEnter={() => setOpenMenu(null)}>
            About
          </Link>
          <Link to="/membership" className={linkClass} onMouseEnter={() => setOpenMenu(null)}>
            Membership
          </Link>
          <Link
            to="/trip-builder"
            className={`flex items-center gap-1 text-gold ${linkClass}`}
            onMouseEnter={() => setOpenMenu(null)}
          >
            <Sparkles className="h-2.5 w-2.5" /> Bespoke Trips
          </Link>
        </nav>

        <div className="hidden shrink-0 items-center justify-end gap-1.5 xl:flex">
          <Link to="/auth">
            <Button
              variant={solid ? "outline-ink" : "hero"}
              size="sm"
              className="h-8 rounded-full px-3 text-[0.6rem] uppercase tracking-[0.12em]"
            >
              <User className="h-3 w-3" /> {agent ? "Dashboard" : "Sign in"}
            </Button>
          </Link>
          <Link to="/contact">
            <Button
              variant="gold"
              size="sm"
              className="h-8 rounded-full px-3.5 text-[0.6rem] uppercase tracking-[0.12em]"
            >
              Enquire
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="ml-auto justify-self-end shrink-0 xl:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {openMenu === "destinations" && (
        <div className="hidden border-t border-border bg-sand text-foreground xl:block">
          <div className="container-lux grid grid-cols-3 gap-x-10 gap-y-6 py-10">
            {regions.map((r) => (
              <Link
                key={r.slug}
                to="/destinations/$slug"
                params={{ slug: r.slug }}
                className="group"
                onClick={() => setOpenMenu(null)}
              >
                <p className="font-serif text-xl group-hover:text-gold">{r.name}</p>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{r.blurb}</p>
              </Link>
            ))}
            <Link
              to="/destinations"
              className="self-end text-sm uppercase tracking-widest text-gold"
              onClick={() => setOpenMenu(null)}
            >
              View all destinations →
            </Link>
          </div>
        </div>
      )}
      {openMenu === "journeys" && (
        <div className="hidden border-t border-border bg-sand text-foreground xl:block">
          <div className="container-lux grid grid-cols-3 gap-x-10 gap-y-5 py-10">
            {journeyMenu.map((c) => (
              <Link
                key={c.slug}
                to="/journeys"
                className="group"
                onClick={() => setOpenMenu(null)}
              >
                <p className="font-serif text-xl group-hover:text-gold">{c.name}</p>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{c.blurb}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {mobileOpen && (
        <div className="border-t border-border bg-sand text-foreground xl:hidden">
          <div className="container-lux flex flex-col gap-4 py-6 text-sm">
            <Link to="/destinations" onClick={() => setMobileOpen(false)} className="hover:text-gold">
              Destinations
            </Link>
            <Link to="/journeys" onClick={() => setMobileOpen(false)} className="hover:text-gold">
              Journeys
            </Link>
            <Link to="/blog" onClick={() => setMobileOpen(false)} className="hover:text-gold">
              Inspiration
            </Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="hover:text-gold">
              About
            </Link>
            <Link to="/membership" onClick={() => setMobileOpen(false)} className="hover:text-gold">
              Membership
            </Link>
            <Link to="/trip-builder" onClick={() => setMobileOpen(false)} className="text-gold">
              Bespoke Trips
            </Link>
            <Link to="/contact" onClick={() => setMobileOpen(false)}>
              <Button variant="gold" className="w-full">
                Enquire
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
