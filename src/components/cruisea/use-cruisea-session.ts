import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CruiseaSessionState = {
  loading: boolean;
  signedIn: boolean;
  email: string | null;
  name: string | null;
};

/** Lightweight client-side session read used to gate Cruisea booking actions. */
export function useCruiseaSession(): CruiseaSessionState {
  const [state, setState] = useState<CruiseaSessionState>({
    loading: true,
    signedIn: false,
    email: null,
    name: null,
  });

  useEffect(() => {
    let active = true;
    const apply = (session: { user?: { email?: string | null; user_metadata?: Record<string, unknown> } } | null) => {
      if (!active) return;
      const user = session?.user ?? null;
      setState({
        loading: false,
        signedIn: Boolean(user),
        email: user?.email ?? null,
        name: (user?.user_metadata?.["full_name"] as string | undefined) ?? null,
      });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        apply(session);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
