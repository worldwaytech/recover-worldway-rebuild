import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const avField =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none";

export function AvLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function useSignedInEmail() {
  const [state, setState] = useState<{ ready: boolean; email: string | null }>({ ready: false, email: null });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      setState({ ready: true, email: data.session?.user.email ?? null }),
    );
  }, []);
  return state;
}

export function SignInPrompt({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
      Please{" "}
      <Link to="/auth" className="text-primary underline">
        sign in
      </Link>{" "}
      to {what}. Your request is saved to your Worldway account.
    </div>
  );
}

export type ContactValues = { firstName: string; lastName: string; email: string; phone: string; specialRequests: string };

export function ContactFields({
  value,
  onChange,
}: {
  value: ContactValues;
  onChange: (v: ContactValues) => void;
}) {
  const set = (k: keyof ContactValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AvLabel label="First name"><input required value={value.firstName} onChange={set("firstName")} className={avField} /></AvLabel>
      <AvLabel label="Last name"><input required value={value.lastName} onChange={set("lastName")} className={avField} /></AvLabel>
      <AvLabel label="Email"><input required type="email" value={value.email} onChange={set("email")} className={avField} /></AvLabel>
      <AvLabel label="Phone"><input required value={value.phone} onChange={set("phone")} placeholder="+44 …" className={avField} /></AvLabel>
      <div className="md:col-span-2">
        <AvLabel label="Special requests (catering, occasion, timing…)">
          <textarea rows={3} value={value.specialRequests} onChange={set("specialRequests")} className={avField} />
        </AvLabel>
      </div>
    </div>
  );
}

export function money(n: number | null, currency: string) {
  if (n == null) return "Price on request";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}
