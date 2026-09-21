// Real Super Admin account administration.
//
// Roles live only in `user_roles`, never on a profile, and every change is
// authorized server-side against the caller's own verified role before any
// privileged client is loaded. Accounts are deactivated (sign-in blocked) so
// booking, payment and audit history is preserved instead of being destroyed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ManagedRole = "super_admin" | "admin" | "agent" | "b2b" | "b2c";

export interface ManagedUser {
  id: string;
  email: string | null;
  fullName: string | null;
  company: string | null;
  roles: ManagedRole[];
  createdAt: string;
  active: boolean;
}

const roleSchema = z.enum(["super_admin", "admin", "agent", "b2b", "b2c"]);

/** Confirms the caller genuinely holds super_admin, using their own session. */
async function assertSuperAdmin(context: {
  userId: string;
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}

function callerEmail(context: { claims: Record<string, unknown> }): string | null {
  return typeof context.claims["email"] === "string" ? (context.claims["email"] as string) : null;
}

export const listManagedUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roleRows }, authList] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, company, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    ]);

    const rolesByUser = new Map<string, ManagedRole[]>();
    for (const row of roleRows ?? []) {
      const list = rolesByUser.get(row.user_id) ?? [];
      list.push(row.role as ManagedRole);
      rolesByUser.set(row.user_id, list);
    }
    const bannedUntil = new Map<string, string | null>();
    for (const user of authList.data?.users ?? []) {
      const until = (user as unknown as Record<string, unknown>)["banned_until"];
      bannedUntil.set(user.id, typeof until === "string" ? until : null);
    }

    return (profiles ?? []).map((p) => {
      const until = bannedUntil.get(p.id);
      return {
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        company: p.company,
        roles: rolesByUser.get(p.id) ?? [],
        createdAt: p.created_at,
        active: !until || new Date(until).getTime() <= Date.now(),
      };
    });
  });

export const setManagedUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: roleSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; roles: ManagedRole[] }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A Super Admin may not remove their own super_admin role — this prevents
    // locking the platform out of administration entirely.
    if (data.userId === context.userId && data.role !== "super_admin") {
      throw new Error("You cannot remove your own Super Admin access.");
    }

    // Guard against removing the last Super Admin.
    if (data.role !== "super_admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");
      const { data: hadSuper } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", data.userId)
        .eq("role", "super_admin")
        .maybeSingle();
      if (hadSuper && (count ?? 0) <= 1) {
        throw new Error("At least one Super Admin must remain.");
      }
    }

    const { data: previous } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      actor_email: callerEmail(context),
      action: "user.role.set",
      target_table: "user_roles",
      target_id: data.userId,
      detail: { from: (previous ?? []).map((r) => r.role), to: data.role },
    });

    return { ok: true, roles: [data.role] };
  });

export const setManagedUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; active: boolean }> => {
    await assertSuperAdmin(context as never);
    if (data.userId === context.userId && !data.active)
      throw new Error("You cannot deactivate your own account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      actor_email: callerEmail(context),
      action: data.active ? "user.reactivated" : "user.deactivated",
      target_table: "auth.users",
      target_id: data.userId,
      detail: { active: data.active },
    });

    return { ok: true, active: data.active };
  });
