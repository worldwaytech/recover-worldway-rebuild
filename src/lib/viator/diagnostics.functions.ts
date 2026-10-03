import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_CHECKOUT_EVENTS, sanitizeForTrace } from "@/lib/viator/diagnostics";
import { consumeRateLimit, currentRequest, rateLimitKey, requestFingerprint } from "@/lib/security/rate-limit.server";

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const clientEventSchema = z.object({
  cartRef: z.string().min(1).max(120),
  accessToken: z.string().min(20).max(200),
  event: z.enum(CLIENT_CHECKOUT_EVENTS as unknown as [string, ...string[]]),
  detail: z.string().max(500).optional(),
  origin: z.string().max(200).optional(),
});

/**
 * Browser-side checkout milestones (payment script, iFrame, form, submit).
 * Only accepted from the browser that owns the reservation (access token).
 */
export const logViatorCheckoutEvent = createServerFn({ method: "POST" })
  .inputValidator((d) => clientEventSchema.parse(d))
  .handler(async ({ data }) => {
    await consumeRateLimit(rateLimitKey("viator-diagnostics", requestFingerprint(currentRequest())), 60, 60);
    try {
      const { getActivityBooking } = await import("@/lib/viator/activity-bookings.server");
      const row = await getActivityBooking(data.cartRef);
      const hash = ((row?.audit ?? {}) as { accessTokenHash?: string }).accessTokenHash;
      if (!row || !hash || (await sha256Hex(data.accessToken)) !== hash) return { ok: false };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { viatorEnvironment } = await import("@/lib/viator.server");
      await supabaseAdmin.from("viator_diagnostic_traces").insert({
        source: "client",
        environment: viatorEnvironment(),
        step: data.event,
        cart_ref: data.cartRef,
        ok: !/FAIL|ERROR|OVERDUE/.test(data.event),
        correlation: { pageOrigin: data.origin ?? null },
        error: data.detail ? String(sanitizeForTrace(data.detail)) : null,
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** Staff-only: sanitized JSON package for Viator Tech Support. */
export const exportViatorDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ hours: z.number().int().min(1).max(720).default(72), cartRef: z.string().max(120).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.hours * 3600_000).toISOString();
    let q = context.supabase
      .from("viator_diagnostic_traces")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (data.cartRef) q = q.eq("cart_ref", data.cartRef);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { viatorEnvironment } = await import("@/lib/viator.server");
    const { VIATOR_PAYMENT_SCRIPT_URL, HOSTING_ORIGIN_ALLOWLIST } = await import(
      "@/lib/viator/checkout-contract"
    );
    const traces = rows ?? [];
    const failures = traces.filter((r) => r.ok === false);
    const byStep: Record<string, { calls: number; failures: number; statuses: number[] }> = {};
    for (const r of traces) {
      const s = (byStep[r.step] ??= { calls: 0, failures: 0, statuses: [] });
      s.calls += 1;
      if (r.ok === false) s.failures += 1;
      if (r.http_status && !s.statuses.includes(r.http_status)) s.statuses.push(r.http_status);
    }
    const firstFailure = failures[0] ?? null;

    return {
      package: "Worldway Travels — Viator Affiliate booking diagnostics",
      generatedAt: new Date().toISOString(),
      window: { since, hours: data.hours, cartRef: data.cartRef ?? null },
      integration: {
        api: "Viator Partner API v2 (Affiliate Full Access + Booking)",
        environment: viatorEnvironment(),
        baseUrl:
          viatorEnvironment() === "production"
            ? "https://api.viator.com/partner"
            : "https://api.sandbox.viator.com/partner",
        acceptHeader: "application/json;version=2.0",
        timeouts: { contentMs: 15000, bookingMs: 120000 },
        flow: [
          "POST /availability/check",
          "POST /bookings/cart/hold (paymentDataSubmissionMode=VIATOR_FORM, hostingUrl)",
          "Browser: payment.js Payment.init(paymentSessionToken).renderCard({cardElementContainer: <element id>})",
          "Browser: handler.submit({address:{country,postalCode}}) -> paymentToken",
          "POST /bookings/cart/book (cartRef + paymentToken)",
          "POST /bookings/status (on timeout/5xx or PENDING)",
        ],
      },
      iframeConfiguration: {
        paymentScriptUrl: VIATOR_PAYMENT_SCRIPT_URL,
        renderMethod: "renderCard",
        containerType: "element id string",
        hostingUrlAllowlist: HOSTING_ORIGIN_ALLOWLIST,
        hostingUrlsSent: Array.from(
          new Set(
            traces
              .map((r) => (r.request as Record<string, unknown> | null)?.["hostingUrl"])
              .filter((v): v is string => typeof v === "string"),
          ),
        ),
      },
      summary: {
        totalEvents: traces.length,
        failures: failures.length,
        byStep,
        firstFailure: firstFailure
          ? {
              at: firstFailure.created_at,
              step: firstFailure.step,
              httpStatus: firstFailure.http_status,
              error: firstFailure.error,
              trackingId: firstFailure.tracking_id,
            }
          : null,
        trackingIds: Array.from(new Set(traces.map((r) => r.tracking_id).filter(Boolean))),
      },
      redaction:
        "API keys, payment/session tokens, card and billing data, names, emails, phone numbers, booking-question answers and addresses are removed before storage.",
      events: traces.map((r) => ({
        at: r.created_at,
        source: r.source,
        environment: r.environment,
        step: r.step,
        method: r.method,
        path: r.path,
        httpStatus: r.http_status,
        durationMs: r.duration_ms,
        ok: r.ok,
        cartRef: r.cart_ref,
        partnerCartRef: r.partner_cart_ref,
        trackingId: r.tracking_id,
        correlation: r.correlation,
        request: r.request,
        response: r.response,
        error: r.error,
      })),
    };
  });
