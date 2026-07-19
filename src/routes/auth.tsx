import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | Worldway Luxe" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-10 shadow-elegant">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold text-gold-foreground font-serif text-2xl">W</div>
          <h1 className="mt-4 font-serif text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Access your Worldway account & bookings.</p>
        </div>
        <div className="mt-8 rounded-sm border border-dashed border-border bg-background/50 p-6 text-center text-sm text-muted-foreground">
          {/* TODO(Lovable Cloud): render real sign-in form using @/lib/auth once Cloud is enabled. */}
          Authentication activates when Lovable Cloud is enabled on this project.
        </div>
        <div className="mt-6 text-center">
          <Link to="/"><Button variant="outline-ink">← Back home</Button></Link>
        </div>
      </div>
    </main>
  );
}
