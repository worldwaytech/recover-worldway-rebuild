/**
 * Unified Worldway payment authority, server-only.
 *
 * Account/commercial policy lives here, above provider execution. Razorpay,
 * Wallet and future providers remain transport/execution methods.
 */
import { optionalUserId } from "./payments.server";

export const PAYMENT_ACCOUNT_TYPES = [
  "b2c","b2b","agent","enterprise","corporate","company","hni","uhni","white_label","partner",
] as const;
export type PaymentAccountType = typeof PAYMENT_ACCOUNT_TYPES[number];

export const PAYMENT_METHODS = ["razorpay","wallet","bank_transfer","credit"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

type PolicyRow = {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  account_type: PaymentAccountType;
  credit_enabled: boolean;
  credit_limit_minor: number;
  invoice_terms_days: number;
  max_transaction_minor: number;
  approval_above_minor: number | null;
  allowed_methods: string[];
  currency: string;
  active: boolean;
};

export type PaymentAuthority = {
  userId: string | null;
  tenantId: string | null;
  accountType: PaymentAccountType;
  policyId: string | null;
  creditEnabled: boolean;
  creditLimitMinor: number;
  invoiceTermsDays: number;
  maxTransactionMinor: number;
  approvalAboveMinor: number | null;
  allowedMethods: PaymentMethod[];
  currency: string;
};

const DEFAULT_POLICY: Omit<PaymentAuthority, "userId" | "tenantId"> = {
  accountType: "b2c",
  policyId: null,
  creditEnabled: false,
  creditLimitMinor: 0,
  invoiceTermsDays: 0,
  maxTransactionMinor: 2_000_000_000,
  approvalAboveMinor: null,
  allowedMethods: ["razorpay","wallet","bank_transfer"],
  currency: "INR",
};

function normalizeMethods(input: string[] | null | undefined): PaymentMethod[] {
  return (input ?? []).filter((m): m is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(m));
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function roleFor(userId: string): Promise<PaymentAccountType> {
  const sb = await db();
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: { role?: string }) => r.role));
  if (roles.has("b2b")) return "b2b";
  if (roles.has("agent")) return "agent";
  return "b2c";
}

async function tenantFor(userId: string): Promise<string | null> {
  const sb = await db();
  const { data } = await sb.from("partner_members").select("tenant_id, role, partner_tenants!inner(status)").eq("user_id", userId);
  const active = (data ?? []).find((r: { tenant_id?: string; partner_tenants?: { status?: string } | null }) => r.partner_tenants?.status === "active");
  return active?.tenant_id ?? null;
}

export async function resolvePaymentAuthority(userId?: string | null): Promise<PaymentAuthority> {
  const resolvedUserId = userId ?? await optionalUserId();
  if (!resolvedUserId) return { ...DEFAULT_POLICY, userId: null, tenantId: null };

  const sb = await db();
  const accountType = await roleFor(resolvedUserId);
  const tenantId = await tenantFor(resolvedUserId);

  let policy: PolicyRow | null = null;
  if (tenantId) {
    const { data } = await sb.from("payment_account_policies").select("*").eq("tenant_id", tenantId).eq("active", true).maybeSingle();
    policy = (data as PolicyRow | null) ?? null;
  }
  if (!policy) {
    const { data } = await sb.from("payment_account_policies").select("*").eq("user_id", resolvedUserId).eq("active", true).maybeSingle();
    policy = (data as PolicyRow | null) ?? null;
  }

  if (!policy) {
    return { ...DEFAULT_POLICY, userId: resolvedUserId, tenantId, accountType };
  }

  return {
    userId: resolvedUserId,
    tenantId: policy.tenant_id,
    accountType: policy.account_type,
    policyId: policy.id,
    creditEnabled: policy.credit_enabled,
    creditLimitMinor: Number(policy.credit_limit_minor),
    invoiceTermsDays: Number(policy.invoice_terms_days),
    maxTransactionMinor: Number(policy.max_transaction_minor),
    approvalAboveMinor: policy.approval_above_minor == null ? null : Number(policy.approval_above_minor),
    allowedMethods: normalizeMethods(policy.allowed_methods),
    currency: policy.currency.toUpperCase(),
  };
}

export function authorizePaymentRequest(
  authority: PaymentAuthority,
  input: { method: PaymentMethod; amountMinor: number; currency: string; approved?: boolean },
): { ok: true; requiresApproval: boolean } | { ok: false; error: string } {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, error: "Invalid payment amount." };
  }
  const currency = input.currency.trim().toUpperCase();
  if (!currency) return { ok: false, error: "Payment currency is required." };
  if (!authority.allowedMethods.includes(input.method)) {
    return { ok: false, error: `Payment method is not enabled for this account.` };
  }
  if (input.amountMinor > authority.maxTransactionMinor) {
    return { ok: false, error: "This transaction exceeds the account's configured payment limit." };
  }
  const requiresApproval =
    authority.approvalAboveMinor !== null && input.amountMinor > authority.approvalAboveMinor;
  if (requiresApproval && !input.approved) {
    return { ok: true, requiresApproval: true };
  }
  if (input.method === "credit" && (!authority.creditEnabled || input.amountMinor > authority.creditLimitMinor)) {
    return { ok: false, error: "Credit terms are not enabled for this account or the requested amount exceeds its approved credit limit." };
  }
  return { ok: true, requiresApproval: false };
}
