/**
 * Readiness gate for the Viator secure card form. Pay & confirm may run only
 * when the card element has signalled FORM_LOADED (mounted + ready), the
 * entered card is complete, the handler exists, and no submit is in flight.
 * Pure so it can be regression-tested without a browser.
 */
export interface PaymentReadinessInput {
  hasHandler: boolean;
  formLoaded: boolean;
  formValid: boolean;
  submitting: boolean;
  postalCode: string;
  missingAnswer: string | null;
}

export type PaymentBlocker =
  | "HANDLER_MISSING"
  | "FORM_NOT_LOADED"
  | "CARD_INCOMPLETE"
  | "SUBMIT_IN_FLIGHT"
  | "POSTAL_CODE_MISSING"
  | "ANSWER_MISSING";

export function paymentBlocker(i: PaymentReadinessInput): PaymentBlocker | null {
  if (i.submitting) return "SUBMIT_IN_FLIGHT";
  if (!i.hasHandler) return "HANDLER_MISSING";
  if (!i.formLoaded) return "FORM_NOT_LOADED";
  if (!i.formValid) return "CARD_INCOMPLETE";
  if (!i.postalCode.trim()) return "POSTAL_CODE_MISSING";
  if (i.missingAnswer) return "ANSWER_MISSING";
  return null;
}

/** The card form must stay mounted from "paying" through tokenisation/booking. */
export function cardFormShouldBeMounted(phase: string): boolean {
  return phase === "paying" || phase === "booking";
}

/** Diagnostic text safe to log: no card data, tokens or secrets, bounded length. */
export function safeDiagnostic(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
  return msg.replace(/\b\d{12,19}\b/g, "[redacted]").replace(/(tok|pm|pi|seti)_[A-Za-z0-9]+/g, "$1_[redacted]").slice(0, 240);
}
