import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portal, type PortalUser, type Role } from "@/lib/portal-store";
import type { Session, User } from "@supabase/supabase-js";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  tier: string | null;
  created_at: string;
  user_roles?: { role: string }[] | null;
}

interface ProfilesQuery {
  select: (columns: string) => {
    order: (
      column: string,
      options: { ascending: boolean },
    ) => Promise<{ data: ProfileRow[] | null }>;
  };
}

function providerOf(user: User): PortalUser["provider"] {
  const p = user.app_metadata?.provider;
  if (p === "google" || p === "apple" || p === "facebook") return p;
  return "email";
}

async function hydrate(session: Session | null) {
  if (!session?.user) {
    portal._setSession(null);
    portal._setUsers([]);
    return;
  }
  const user = session.user;
  const [{ data: profile }, { data: roleRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, tier, avatar_url").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const role = (roleRow?.role as Role | undefined) ?? "b2c";
  const me: PortalUser = {
    id: user.id,
    email: user.email ?? "",
    name:
      profile?.full_name ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Member",
    role,
    provider: providerOf(user),
    createdAt: user.created_at,
    tier: (profile?.tier as PortalUser["tier"]) ?? "traveler",
  };
  portal._setSession(me);

  // Super admins can see all users; other roles just see themselves.
  if (role === "super_admin") {
    const query = supabase.from("profiles") as unknown as ProfilesQuery;
    const { data: users } = await query
      .select("id, email, full_name, tier, created_at, user_roles(role)")
      .order("created_at", { ascending: false });
    if (users) {
      portal._setUsers(
        users.map((u) => ({
          id: u.id,
          email: u.email ?? "",
          name: u.full_name ?? u.email?.split("@")[0] ?? "Member",
          role: (u.user_roles?.[0]?.role as Role) ?? "b2c",
          provider: "email",
          createdAt: u.created_at,
          tier: (u.tier as PortalUser["tier"]) ?? "traveler",
        })),
      );
    }
  } else {
    portal._setUsers([me]);
  }
}

export function useAuthHydration() {
  useEffect(() => {
    // Prime session on mount.
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        hydrate(session);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);
}
