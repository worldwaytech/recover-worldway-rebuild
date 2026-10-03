import { findSupplierLeaks, redactText } from "@/lib/confidentiality/redact";

export const CUSTOMER_AI_FALLBACK =
  "I can help with that through Worldway. Please let me know what you would like to plan.";

export function sanitizeCustomerAiReply(value: unknown): string {
  if (typeof value !== "string") return CUSTOMER_AI_FALLBACK;
  const redacted = redactText(value).trim();
  if (!redacted) return CUSTOMER_AI_FALLBACK;
  if (findSupplierLeaks(redacted).length > 0) return CUSTOMER_AI_FALLBACK;
  return redacted;
}
