import { createHash } from "node:crypto";

export const SECURITY_ACTIONS = [
  "read","search","quote","simulate","hold","book","modify","pay","cancel","refund","admin",
] as const;
export type SecurityAction = typeof SECURITY_ACTIONS[number];

export const SECURITY_ROLES = ["public","authenticated","partner","agent","staff","super_admin"] as const;
export type SecurityRole = typeof SECURITY_ROLES[number];

const ROLE_ORDER: Record<SecurityRole, number> = {
  public: 0, authenticated: 1, partner: 2, agent: 2, staff: 3, super_admin: 4,
};

const MIN_ROLE: Record<SecurityAction, SecurityRole> = {
  read: "public", search: "public", quote: "authenticated", simulate: "authenticated",
  hold: "staff", book: "staff", modify: "staff", pay: "staff", cancel: "staff",
  refund: "staff", admin: "super_admin",
};

export interface SecurityPrincipal {
  userId?: string | null;
  tenantId?: string | null;
  role: SecurityRole;
  scopes: string[];
  mfaVerified?: boolean;
  requestId?: string;
}

export interface SecurityDecision {
  allowed: boolean;
  reason: string;
  requiresStepUp: boolean;
}

export function authorizeSecurityAction(
  action: SecurityAction,
  principal: SecurityPrincipal,
  context: { tenantId?: string | null; resourceTenantId?: string | null; deterministicGrant?: boolean } = {},
): SecurityDecision {
  const minimum = MIN_ROLE[action];
  if (ROLE_ORDER[principal.role] < ROLE_ORDER[minimum]) {
    return { allowed: false, reason: "insufficient_role", requiresStepUp: false };
  }
  if (context.resourceTenantId && context.tenantId !== context.resourceTenantId) {
    return { allowed: false, reason: "tenant_isolation", requiresStepUp: false };
  }
  if (action === "admin" && principal.role !== "super_admin") {
    return { allowed: false, reason: "super_admin_required", requiresStepUp: false };
  }
  const mutating = ["hold","book","modify","pay","cancel","refund","admin"].includes(action);
  const requiresStepUp = mutating && !principal.mfaVerified;
  if (requiresStepUp) return { allowed: false, reason: "step_up_authentication_required", requiresStepUp: true };
  if (mutating && !context.deterministicGrant) {
    return { allowed: false, reason: "deterministic_grant_required", requiresStepUp: false };
  }
  return { allowed: true, reason: "allowed", requiresStepUp: false };
}

const SECRET_KEYS = /(?:api[_-]?key|secret|password|token|authorization|cookie|private[_-]?key|client[_-]?secret|card|cvv|cvc)/i;

export function redactSecurityValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecurityValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, SECRET_KEYS.test(key) ? "[REDACTED]" : redactSecurityValue(item),
    ]));
  }
  if (typeof value === "string" && value.length > 256) return value.slice(0, 256) + "…";
  return value;
}

export function securityFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export interface SecurityControlStatus {
  id: string;
  category: "identity" | "ai" | "commerce" | "operations" | "privacy";
  status: "pass" | "warn" | "fail";
  evidence: string;
}

export function evaluateSecurityControls(input: {
  rateLimiterAvailable: boolean;
  aiInjectionGuard: boolean;
  toolPermissionBoundary: boolean;
  tenantIsolation: boolean;
  securityHeaders: boolean;
  auditTrail: boolean;
  backupVerification: boolean;
  incidentRunbook: boolean;
  privacyControls: boolean;
}): SecurityControlStatus[] {
  const checks: Array<[string, SecurityControlStatus["category"], boolean, string]> = [
    ["rate-limiter","commerce",input.rateLimiterAvailable,"Distributed rate limiting is available."],
    ["ai-injection-guard","ai",input.aiInjectionGuard,"Untrusted/model-produced content has an injection boundary."],
    ["tool-permission-boundary","ai",input.toolPermissionBoundary,"AI tools enforce role/scope/risk boundaries."],
    ["tenant-isolation","identity",input.tenantIsolation,"Cross-tenant access is denied by policy."],
    ["security-headers","operations",input.securityHeaders,"HTTP security headers are enforced."],
    ["audit-trail","operations",input.auditTrail,"Security-sensitive operations produce audit evidence."],
    ["backup-verification","operations",input.backupVerification,"Backup/restore verification evidence is available."],
    ["incident-runbook","operations",input.incidentRunbook,"Incident response controls are documented."],
    ["privacy-controls","privacy",input.privacyControls,"Privacy and consent boundaries are enforced."],
  ];
  return checks.map(([id,category,ok,evidence]) => ({
    id, category, status: ok ? "pass" : "fail", evidence: ok ? evidence : "Control evidence missing.",
  }));
}
