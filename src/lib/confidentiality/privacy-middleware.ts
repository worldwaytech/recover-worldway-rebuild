import { createMiddleware } from "@tanstack/react-start";

// Global supplier-privacy middleware for every server function.
// Non-staff callers (customers, B2B, anonymous, SSR) receive sanitized results;
// only verified Admin/Super Admin callers receive real supplier data.
// Sealed Worldway references in inputs are always restored first.
export const supplierPrivacyMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next, data }) => {
    const g = await import("./guard.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const restored = await g.restoreInbound(data);
    let staff = false;
    try {
      staff = await g.callerIsStaff(getRequestHeader("authorization"));
    } catch {
      staff = false;
    }
    try {
      const res = await next({ data: restored } as never);
      if (staff) return res;
      const r = res as unknown as { result?: unknown };
      if (r.result === undefined || r.result instanceof Response) return res;
      return { ...res, result: await g.sanitizeOutbound(r.result) } as typeof res;
    } catch (e) {
      if (!staff) g.redactError(e);
      throw e;
    }
  },
);
