// Deterministic-authority rules. AI is NEVER the source of truth for these facts;
// they come only from Worldway engines (pricing, inventory, booking, payments).

export const AUTHORITATIVE_FACTS = [
  "price", "availability", "schedule", "supplier_capability", "booking_eligibility", "payment_status", "refund_amount", "cancellation_result",
] as const;
export type AuthoritativeFact = (typeof AUTHORITATIVE_FACTS)[number];

export class AuthorityViolationError extends Error {
  constructor(public facts: string[]) { super(`AI attempted to assert authoritative facts: ${facts.join(", ")}`); }
}

/** Field names an AI-produced object must never carry as decisions. */
const FORBIDDEN_KEYS: Record<string, AuthoritativeFact> = {
  price: "price", total: "price", amount: "price", fare: "price", net: "price",
  available: "availability", availability: "availability", seats: "availability",
  departure_time: "schedule", arrival_time: "schedule",
  bookable: "booking_eligibility", booking_status: "booking_eligibility", confirmed: "booking_eligibility",
  payment_status: "payment_status", paid: "payment_status",
  refund_amount: "refund_amount", refunded: "refund_amount",
  cancellation_status: "cancellation_result", cancelled: "cancellation_result",
  capabilities: "supplier_capability", certified: "supplier_capability",
};

/** Throws if an AI-generated structure tries to set an authoritative field. */
export function assertNoAuthorityFields(value: unknown, path = "$"): void {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      const f = FORBIDDEN_KEYS[k.toLowerCase()];
      if (f && x !== null && x !== undefined) hits.push(`${p}.${k}(${f})`);
      walk(x, `${p}.${k}`);
    }
  };
  walk(value, path);
  if (hits.length) throw new AuthorityViolationError(hits);
}

/** Free-text rationale may not claim confirmed bookings/payments/refunds. */
const CLAIMS = /\b(booking (is )?confirmed|payment (is )?(received|captured|successful)|refund(ed)? (of|is) |ticket(ed)? issued|guaranteed (price|availability))\b/i;
export function assertNoAuthorityClaims(text: string): void {
  if (CLAIMS.test(text)) throw new AuthorityViolationError(["claim"]);
}

/** Merge rule: engine values always win over anything the AI proposed. */
export function engineWins<T extends Record<string, unknown>>(aiProposal: Record<string, unknown>, engine: T): T {
  return { ...aiProposal, ...engine } as T;
}
