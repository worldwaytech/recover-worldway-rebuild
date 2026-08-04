import { Link } from "@tanstack/react-router";

const COMPANY = [
  { to: "/about", label: "About us" },
  { to: "/trust", label: "Trust & safety" },
  { to: "/executive", label: "Partner readiness" },
  { to: "/help", label: "Help centre" },
  { to: "/contact", label: "Contact" },
] as const;

const LEGAL = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/cookies", label: "Cookies" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 md:grid-cols-5">
        <div>
          <div className="font-serif text-lg tracking-widest text-primary">
            WORLDWAY TRAVELS GROUP
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Discreet, bespoke luxury travel — curated flights, residences, and experiences on six
            continents.
          </p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Travel</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/private-jets" className="hover:text-foreground">
                Private Jets
              </Link>
            </li>
            <li>
              <Link to="/flights" className="hover:text-foreground">
                Flights
              </Link>
            </li>
            <li>
              <Link to="/hotels" className="hover:text-foreground">
                Residences & Hotels
              </Link>
            </li>
            <li>
              <Link to="/activities" className="hover:text-foreground">
                Experiences
              </Link>
            </li>
            <li>
              <Link to="/villas" className="hover:text-foreground">
                Villas & Estates
              </Link>
            </li>
            <li>
              <Link to="/yachts" className="hover:text-foreground">
                Yacht Charters
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Collections</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/cruises" className="hover:text-foreground">
                Luxury Cruises
              </Link>
            </li>
            <li>
              <Link to="/rail" className="hover:text-foreground">
                Luxury Rail
              </Link>
            </li>
            <li>
              <Link to="/safari" className="hover:text-foreground">
                Safari
              </Link>
            </li>
            <li>
              <Link to="/polar-expeditions" className="hover:text-foreground">
                Polar Expeditions
              </Link>
            </li>
            <li>
              <Link to="/tailor-made" className="hover:text-foreground">
                Tailor-Made
              </Link>
            </li>
            <li>
              <Link to="/insurance" className="hover:text-foreground">
                Travel Insurance
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Company</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {COMPANY.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Contact</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>concierge@worldwaytravelsgroup.com</li>
            <li>+1 (800) 000-0000</li>
            <li>Available 24 / 7 / 365</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs tracking-widest text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-4">
          {LEGAL.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mt-3">
          © {new Date().getFullYear()} WORLDWAY TRAVELS GROUP · ALL RIGHTS RESERVED
        </div>
      </div>
    </footer>
  );
}
