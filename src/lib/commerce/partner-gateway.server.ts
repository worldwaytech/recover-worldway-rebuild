// Shared partner API gateway (server-only): auth → scope → rate limit → commerce engine → usage log.
// Used by /api/v1/commerce/{op} (documented base URL) and the legacy /api/public/v1 alias.
export const COMMERCE_OPS: Record<string, string> = {
  "search-flights": "searchFlights",
  "search-tours": "searchTours",
  "tour-availability": "tourAvailability",
  "quote-tour": "quoteTour",
  "plan-trip": "planTrip",
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

export async function handleCommerceRequest(request: Request, opParam: string): Promise<Response> {
  const op = COMMERCE_OPS[opParam];
  if (!op) return json(404, { error: "unknown_operation", operations: Object.keys(COMMERCE_OPS) });
  const started = Date.now();
  const { authenticatePartner, requireScope, enforceRateLimit, logUsage, PartnerAuthError } = await import("./partner-auth.server");
  let principal;
  try {
    principal = await authenticatePartner(request);
    requireScope(principal, op as never);
    await enforceRateLimit(principal);
  } catch (e) {
    if (e instanceof PartnerAuthError) {
      if (principal) await logUsage(principal, opParam, e.status, Date.now() - started).catch(() => {});
      return json(e.status, { error: e.message }, e.status === 429 ? { "retry-after": "60" } : {});
    }
    console.error("[partner-api] auth failure", e instanceof Error ? e.message : "error");
    return json(500, { error: "internal_error" });
  }
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== "object") {
    await logUsage(principal, opParam, 400, Date.now() - started).catch(() => {});
    return json(400, { error: "JSON body required" });
  }
  const { runCommerce } = await import("./commerce.server");
  const r = await runCommerce(op as never, body);
  const status = r.ok ? 200 : r.error?.startsWith("Invalid input") ? 400 : 422;
  await logUsage(principal, opParam, status, Date.now() - started).catch(() => {});
  return json(status, r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error });
}
