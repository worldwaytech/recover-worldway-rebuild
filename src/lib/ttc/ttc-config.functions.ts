import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// TTC configuration — the TAP ID lives in a server-only table (no client access,
// RLS with no policies). Values are never returned to the browser or logged;
// only a masked preview and status leave the server.

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean; error: unknown }> };
type Ctx = { supabase: RpcClient; userId: string };

async function assertSuperAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error) throw new Error("Your permissions could not be verified.");
  if (!data) throw new Error("Only the Super Admin can manage TTC configuration.");
}

function mask(value: string): string {
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}

const FUTURE_SECRETS = ["TTC_API_TOKEN", "TTC_CLIENT_ID", "TTC_AGENT_ID"] as const;

async function readStatus() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{
            data: { tap_id: string | null; tap_id_updated_at: string | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("ttc_config")
    .select("tap_id, tap_id_updated_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error("TTC configuration could not be loaded.");
  const tap = data?.tap_id ?? null;
  return {
    tapId: {
      configured: Boolean(tap),
      masked: tap ? mask(tap) : null,
      length: tap?.length ?? 0,
      updatedAt: data?.tap_id_updated_at ?? null,
    },
    futureCredentials: FUTURE_SECRETS.map((name) => ({
      name,
      present: Boolean(process.env[name]),
      active: false,
    })),
  };
}

export const getTtcConfigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context as never);
    return readStatus();
  });

export const saveTtcTapId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tapId: string }) => {
    const tapId = String(input?.tapId ?? "").trim();
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(tapId)) {
      throw new Error("TAP ID must be 2–64 letters, numbers, dots, dashes or underscores.");
    }
    return { tapId };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as never as {
      from: (t: string) => {
        upsert: (r: object, o: object) => Promise<{ error: { message: string } | null }>;
      };
    })
      .from("ttc_config")
      .upsert(
        {
          id: "default",
          tap_id: data.tapId,
          tap_id_updated_at: new Date().toISOString(),
          tap_id_updated_by: (context as never as Ctx).userId,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error("The TAP ID could not be saved.");
    const status = await readStatus();
    // Verify by read-back without returning the raw value.
    const verified = status.tapId.configured && status.tapId.length === data.tapId.length;
    return { ...status, verified };
  });
