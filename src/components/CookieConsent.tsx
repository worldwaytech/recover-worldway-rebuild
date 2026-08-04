import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COOKIE_PREFS_EVENT,
  getStoredConsent,
  setStoredConsent,
  type ConsentChoice,
} from "@/lib/cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getStoredConsent()) setVisible(true);
    const reopen = () => setVisible(true);
    window.addEventListener(COOKIE_PREFS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_PREFS_EVENT, reopen);
  }, []);

  function choose(choice: ConsentChoice) {
    setStoredConsent(choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/98 backdrop-blur-md shadow-elegant"
    >
      <div className="container-lux flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            We use strictly necessary cookies to run Worldway Luxe, and — with your consent —
            analytics and personalisation cookies to improve your experience. Read our{" "}
            <Link to="/cookies" className="text-foreground underline underline-offset-2 hover:text-gold">
              Cookie Policy
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-2 hover:text-gold">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline-ink" size="sm" onClick={() => choose("rejected")}>
            Reject non-essential
          </Button>
          <Button variant="gold" size="sm" onClick={() => choose("accepted")}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
