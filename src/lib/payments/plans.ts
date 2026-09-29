/**
 * Client-safe payment catalogue.
 *
 * Amounts are stored in the smallest currency unit (paise for INR, cents for
 * USD) because that is what Razorpay expects and it avoids float rounding.
 */

export type PaymentPurpose =
  | "flight"
  | "hotel"
  | "bus"
  | "activity"
  | "tour"
  | "cruise"
  | "rail"
  | "transfer"
  | "membership"
  | "wallet_topup"
  | "deposit"
  | "private_aviation";

export const PAYMENT_PURPOSES: PaymentPurpose[] = [
  "flight",
  "hotel",
  "bus",
  "activity",
  "tour",
  "cruise",
  "rail",
  "transfer",
  "membership",
  "wallet_topup",
  "deposit",
  "private_aviation",
];

export type MembershipPlanId = "travel_plus" | "elite" | "elite_plus";

export type MembershipPlan = {
  id: MembershipPlanId;
  name: string;
  currency: "USD";
  /** Smallest currency unit (cents). */
  amountMinor: number;
  cadence: "year";
};

/** Server-trusted membership pricing — never take a membership amount from the client. */
export const MEMBERSHIP_PLANS: Record<MembershipPlanId, MembershipPlan> = {
  travel_plus: {
    id: "travel_plus",
    name: "Travel Plus",
    currency: "USD",
    amountMinor: 19900,
    cadence: "year",
  },
  elite: {
    id: "elite",
    name: "Elite",
    currency: "USD",
    amountMinor: 29900,
    cadence: "year",
  },
  elite_plus: {
    id: "elite_plus",
    name: "Elite Plus",
    currency: "USD",
    amountMinor: 59900,
    cadence: "year",
  },
};

export function isMembershipPlanId(value: string): value is MembershipPlanId {
  return value === "travel_plus" || value === "elite" || value === "elite_plus";
}

/** Convert major units (e.g. 1234.50) to minor units, rounding to the nearest unit. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(amountMinor: number): number {
  return amountMinor / 100;
}

export function formatMinor(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(fromMinorUnits(amountMinor));
  } catch {
    return `${currency} ${fromMinorUnits(amountMinor).toLocaleString()}`;
  }
}
