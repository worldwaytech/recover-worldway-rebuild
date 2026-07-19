import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "./privacy";
import { Button } from "@/components/ui/button";
import { openCookiePreferences } from "@/lib/cookie-consent";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy | Worldway Luxe" },
      { name: "description", content: "How Worldway Luxe uses cookies and how to manage your preferences." },
      { property: "og:url", content: "/cookies" },
    ],
    links: [{ rel: "canonical", href: "/cookies" }],
  }),
  component: () => (
    <LegalPage title="Cookie Policy">
      <p>We use strictly necessary cookies to run Worldway Luxe. With your consent, we may also use analytics and personalisation cookies to improve your experience.</p>
      <p>You can change your preferences at any time.</p>
      <div className="pt-4">
        <Button variant="gold" onClick={openCookiePreferences}>Manage preferences</Button>
      </div>
    </LegalPage>
  ),
});
