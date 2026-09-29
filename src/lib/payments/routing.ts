/**
 * Payment routing decision — client-safe and pure.
 *
 * The rule is deliberately strict and fails closed onto the existing Worldway
 * orchestrator (Razorpay). Only a cart that consists exclusively of Viator
 * Activities may use the Viator hosted payment iFrame.
 */

export type PaymentRoute = "VIATOR_HOSTED_IFRAME" | "EXISTING_PAYMENT_ORCHESTRATOR";

/** Product families that must NEVER be routed through Viator payments. */
export const NON_VIATOR_PRODUCT_KINDS = [
  "flight",
  "hotel",
  "transfer",
  "bus",
  "private_jet",
  "cruise",
  "rail",
  "car_rental",
  "villa",
  "yacht",
  "visa",
  "insurance",
  "concierge",
  "trip_builder",
  "membership",
  "wallet_topup",
  "deposit",
  "tour",
] as const;

export type CheckoutLine = {
  /** Supplier identifier, e.g. "viator", "up17", "sherpa". */
  supplier: string;
  /** Product family, e.g. "activity", "flight", "hotel". */
  productKind: string;
};

export type RouteDecision = {
  route: PaymentRoute;
  reason:
    | "viator_activities_only"
    | "empty_cart"
    | "mixed_supplier_cart"
    | "non_viator_product"
    | "non_activity_product";
};

function isViatorActivityLine(line: CheckoutLine): boolean {
  return (
    // "ww-activity" is the neutral browser code for the same live activity rail.
    ["viator", "ww-activity"].includes(line.supplier.trim().toLowerCase()) &&
    line.productKind.trim().toLowerCase() === "activity"
  );
}

/**
 * Decides which payment rail a checkout must use.
 * Anything that is not a pure Viator-Activities cart keeps the existing flow.
 */
export function resolvePaymentRoute(lines: readonly CheckoutLine[]): RouteDecision {
  if (!lines.length) {
    return { route: "EXISTING_PAYMENT_ORCHESTRATOR", reason: "empty_cart" };
  }

  const viatorActivities = lines.filter(isViatorActivityLine);
  if (viatorActivities.length === lines.length) {
    return { route: "VIATOR_HOSTED_IFRAME", reason: "viator_activities_only" };
  }

  const others = lines.filter((l) => !isViatorActivityLine(l));
  const foreignSupplier = others.some((l) => l.supplier.trim().toLowerCase() !== "viator");
  if (viatorActivities.length > 0) {
    return { route: "EXISTING_PAYMENT_ORCHESTRATOR", reason: "mixed_supplier_cart" };
  }
  if (foreignSupplier) {
    return { route: "EXISTING_PAYMENT_ORCHESTRATOR", reason: "non_viator_product" };
  }
  return { route: "EXISTING_PAYMENT_ORCHESTRATOR", reason: "non_activity_product" };
}

export function isViatorHostedRoute(lines: readonly CheckoutLine[]): boolean {
  return resolvePaymentRoute(lines).route === "VIATOR_HOSTED_IFRAME";
}
