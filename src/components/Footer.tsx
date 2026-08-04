import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Twitter, Mail, Phone } from "lucide-react";
import { regions, categories } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function Footer() {
  const [email, setEmail] = useState("");

  function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    // TODO(Lovable Cloud): persist subscribers to a `newsletter_subscribers` table.
    toast.success("Thank you — welcome to the Worldway circle.");
    setEmail("");
  }

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container-lux grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold text-gold-foreground font-serif text-2xl">
              W
            </div>
            <div>
              <p className="font-serif text-2xl">Worldway Luxe</p>
              <p className="mt-1 text-xs uppercase tracking-[0.3em] text-gold">Luxury Journeys</p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm text-primary-foreground/70">
            Extraordinary journeys across the world — tailor-made luxury travel, private journeys,
            small group departures, expedition cruises and private jet experiences.
          </p>
          <div className="mt-6 flex gap-4">
            {[Instagram, Facebook, Twitter].map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label="Social"
                className="text-primary-foreground/70 hover:text-gold transition-colors"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow mb-4">Destinations</p>
          <ul className="space-y-2 text-sm text-primary-foreground/70">
            {regions.map((r) => (
              <li key={r.slug}>
                <Link to="/destinations/$region" params={{ region: r.slug }} className="hover:text-gold">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-4">Journeys</p>
          <ul className="space-y-2 text-sm text-primary-foreground/70">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link to="/journeys" className="hover:text-gold">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-4">Newsletter</p>
          <p className="text-sm text-primary-foreground/70">
            Travel inspiration and private offers, occasionally.
          </p>
          <form onSubmit={subscribe} className="mt-4 flex flex-col gap-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="border-primary-foreground/40 bg-transparent text-primary-foreground placeholder:text-primary-foreground/70"
            />
            <Button type="submit" variant="gold" className="w-full">
              Subscribe
            </Button>
          </form>
          <div className="mt-6 space-y-2 text-sm text-primary-foreground/70">
            <a href="tel:+18883686533" className="flex items-start gap-2 hover:text-gold">
              <Phone className="h-4 w-4 mt-1" />
              <span className="whitespace-pre-line">
                US/CA Toll Free +1 888 368 6533{"\n"}Worldwide +1 647 424 1811{"\n"}IND +91 981 469 8546
              </span>
            </a>
            <a href="mailto:partners@worldwayluxe.com" className="flex items-center gap-2 hover:text-gold">
              <Mail className="h-4 w-4" /> partners@worldwayluxe.com
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container-lux flex flex-col items-center justify-between gap-3 py-6 text-xs text-primary-foreground/70 sm:flex-row">
          <p>© 1997–2026 Worldway Luxe. Worldway Luxe is a Partner with A&amp;K.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/about" className="hover:text-gold">About</Link>
            <Link to="/contact" className="hover:text-gold">Contact</Link>
            <Link to="/help" className="hover:text-gold">Help</Link>
            <Link to="/privacy" className="hover:text-gold">Privacy</Link>
            <Link to="/terms" className="hover:text-gold">Terms</Link>
            <Link to="/cookies" className="hover:text-gold">Cookies</Link>
            <Link to="/trust" className="hover:text-gold">Trust</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
