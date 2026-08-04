import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portal, type Role } from "@/lib/portal-store";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Sign in or create your Worldway Travels Group account — clients, agents, and admins.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<Role>("b2c");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function safeNext(): string | null {
    if (!next) return null;
    // Only allow same-origin relative paths.
    if (!next.startsWith("/") || next.startsWith("//")) return null;
    return next;
  }

  function routeFor(r: Role) {
    const n = safeNext();
    if (n) return n;
    if (r === "super_admin") return "/admin/super";
    if (r === "admin") return "/admin";
    if (r === "agent") return "/agent";
    if (r === "b2b") return "/b2b";
    return "/b2c";
  }

  // If already signed in, redirect based on role once hydration lands.
  useEffect(() => {
    const unsub = portal.subscribe(() => {
      const s = portal.session();
      if (s) window.location.href = routeFor(s.role);
    });
    const s = portal.session();
    if (s) window.location.href = routeFor(s.role);
    return unsub;
  }, [nav, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const requestedRole: Role = role === "super_admin" || role === "admin" ? "b2c" : role;
        const n = safeNext();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: n ? window.location.origin + n : window.location.origin,
            data: {
              full_name: name || email.split("@")[0],
              requested_role: requestedRole,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created — you're signed in.");
        } else {
          toast.success("Account created — check your email to confirm your address.");
        }
      }
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setErr(null);
    if (!email) {
      setErr("Enter your email address first, then choose “Forgot password”.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your inbox.");
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message ?? "Could not send the reset link.");
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setErr(null);
    setBusy(true);
    try {
      const n = safeNext();
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: n ? window.location.origin + n : window.location.origin,
      });
      if (result.error) throw result.error;
      // if redirected: browser navigates away
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message ?? "Google sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-serif text-4xl text-primary">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Secure sign-in powered by Lovable Cloud. The first person to sign up becomes Super Admin.
        </p>

        <div className="mt-6 flex gap-2 rounded-full border border-border/60 p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full px-4 py-2 text-sm capitalize ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <Label>Full name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                />
              </div>
              <div>
                <Label>Account type</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["b2c", "b2b", "agent"] as const).map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={`rounded-lg border px-3 py-2 text-sm capitalize ${role === r ? "border-primary text-primary" : "border-border/60 text-muted-foreground"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Admin & Super Admin roles can only be granted by an existing Super Admin.
                </p>
              </div>
            </>
          )}
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          {mode === "signin" && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className="w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Forgot password?
            </button>
          )}
        </form>


        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-border/60" /> or continue with{" "}
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={signInGoogle}
          disabled={busy}
        >
          Continue with Google
        </Button>

        <div className="mt-8 text-xs text-muted-foreground">
          <Link to="/" className="text-primary">
            ← Back home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
