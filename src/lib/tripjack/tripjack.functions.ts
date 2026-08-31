// TripJack server functions. Thin wrappers only — supplier code is imported
// inside handlers so the server-only client (and the credential) never enters
// the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public, credential-free integration status for the Trip services pages.
 * Reports only whether the server credential is present and which documented
 * operations are mapped — never any secret value.
 */
export const getTripjackStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ suite: z.enum(["cabs", "tripsafe"]) }).parse(d))
  .handler(async ({ data }) => {
    const { tripjackCredentialStatus } = await import("./client.server");
    const { TRIPJACK_CAPABILITIES, TRIPJACK_SUITE_LABEL, TRIPJACK_UAT_BASE_URL } = await import(
      "./config"
    );
    const capabilities = TRIPJACK_CAPABILITIES[data.suite].map((c) => ({
      key: c.key,
      label: c.label,
      mutating: c.mutating,
      mapped: c.path !== null,
    }));
    return {
      suite: data.suite,
      label: TRIPJACK_SUITE_LABEL[data.suite],
      environment: "uat" as const,
      baseUrl: TRIPJACK_UAT_BASE_URL,
      credentialConfigured: tripjackCredentialStatus().configured,
      capabilities,
      mappedCount: capabilities.filter((c) => c.mapped).length,
      live: capabilities.some((c) => c.mapped) && tripjackCredentialStatus().configured,
    };
  });

/**
 * Staff-only diagnostics: recent redacted request log plus credential presence.
 */
export const getTripjackDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { tripjackCredentialStatus, tripjackLogs } = await import("./client.server");
    return { credential: tripjackCredentialStatus(), logs: tripjackLogs(50) };
  });

/**
 * Staff-only non-mutating probe of a mapped read capability. Mutating
 * operations are rejected here by design.
 */
export const probeTripjackCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        suite: z.enum(["cabs", "tripsafe"]),
        capability: z.string().max(40),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/wwl.server");
    if (!(await isAdmin(context as never))) throw new Error("Forbidden");
    const { tripjackCapability } = await import("./config");
    const cap = tripjackCapability(data.suite, data.capability);
    if (!cap) return { ok: false as const, message: "Unknown capability." };
    if (cap.mutating) return { ok: false as const, message: "Mutating operations cannot be probed." };
    const { tripjackCall, redact } = await import("./client.server");
    const result = await tripjackCall(data.suite, data.capability, data.payload ?? {});
    return result.ok
      ? { ok: true as const, correlationId: result.correlationId, sample: JSON.stringify(redact(result.data)).slice(0, 4000) }
      : { ok: false as const, message: result.error.message, kind: result.error.kind };
  });
