import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/portal-store";

/**
 * Defence-in-depth guard for privileged UI shells.
 *
 * The security boundary is server-side (RLS policies use `has_role`, and
 * every partner/wallet server function is gated by `requireSupabaseAuth`).
 * This hook adds a client-side check that re-validates the caller against
 * Supabase Auth + the `has_role` RPC on mount — so a user who tampers with
 * in-memory JS state cannot even see the admin/agent shell.
 *
 * Returns:
 *   "checking" — auth still being verified (render nothing)
 *   "allowed"  — user is signed in and holds one of `allowed` roles
 *   "denied"   — no session or role mismatch (caller should redirect)
 */
export function useVerifiedRole(allowed: Role[]): "checking" | "allowed" | "denied" {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userErr || !userData.user) {
        setState("denied");
        return;
      }
      for (const role of allowed) {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: userData.user.id,
          _role: role,
        });
        if (cancelled) return;
        if (!error && data === true) {
          setState("allowed");
          return;
        }
      }
      setState("denied");
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
