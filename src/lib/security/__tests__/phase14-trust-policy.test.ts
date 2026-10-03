import { describe, expect, it } from "vitest";
import {
  authorizeSecurityAction,
  evaluateSecurityControls,
  redactSecurityValue,
  securityFingerprint,
} from "../trust-policy";

describe("Worldway Phase 14 security and trust", () => {
  it("enforces tenant isolation", () => {
    const d = authorizeSecurityAction("read", { role: "staff", scopes: [] }, { tenantId: "a", resourceTenantId: "b" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("tenant_isolation");
  });

  it("requires deterministic grant and step-up auth for mutations", () => {
    const p = { role: "staff" as const, scopes: [], mfaVerified: false };
    expect(authorizeSecurityAction("book", p, { deterministicGrant: true }).reason).toBe("step_up_authentication_required");
    expect(authorizeSecurityAction("book", { ...p, mfaVerified: true }, { deterministicGrant: false }).reason).toBe("deterministic_grant_required");
    expect(authorizeSecurityAction("book", { ...p, mfaVerified: true }, { deterministicGrant: true }).allowed).toBe(true);
  });

  it("never exposes secrets in security evidence", () => {
    expect(redactSecurityValue({ apiKey: "secret", nested: { password: "x", ok: "yes" } })).toEqual({
      apiKey: "[REDACTED]", nested: { password: "[REDACTED]", ok: "yes" },
    });
    expect(securityFingerprint("same")).toBe(securityFingerprint("same"));
    expect(securityFingerprint("same")).not.toBe(securityFingerprint("different"));
  });

  it("evaluates the enterprise control surface deterministically", () => {
    const controls = evaluateSecurityControls({
      rateLimiterAvailable: true, aiInjectionGuard: true, toolPermissionBoundary: true,
      tenantIsolation: true, securityHeaders: true, auditTrail: true,
      backupVerification: false, incidentRunbook: true, privacyControls: true,
    });
    expect(controls).toHaveLength(9);
    expect(controls.find(c => c.id === "backup-verification")?.status).toBe("fail");
    expect(controls.filter(c => c.status === "pass")).toHaveLength(8);
  });
});
