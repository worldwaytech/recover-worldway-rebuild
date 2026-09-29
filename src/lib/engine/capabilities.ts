// Capability control — pure. Only certified PRODUCTION capabilities may enter
// Booking Readiness. Search-only, UAT and sandbox capabilities never do.
import type { CapabilityGrant, SupplierCapability, SupplierRegistration } from "./types";

export const CANONICAL_CAPABILITIES: SupplierCapability[] = [
  "search", "availability", "price", "prebook", "book", "cancel", "modify", "refund", "voucher",
];

const ALIAS: Partial<Record<SupplierCapability, SupplierCapability[]>> = {
  availability: ["revalidate"],
  price: ["revalidate"],
  prebook: ["hold"],
  voucher: ["ticket"],
};

function grantsFor(reg: SupplierRegistration, cap: SupplierCapability): CapabilityGrant[] {
  const names = [cap, ...(ALIAS[cap] ?? [])];
  return (reg.grants ?? []).filter((g) => names.includes(g.capability));
}

/** Supports the capability at all (any environment). Used for search routing. */
export function supports(reg: SupplierRegistration, cap: SupplierCapability): boolean {
  const names = [cap, ...(ALIAS[cap] ?? [])];
  return reg.grants ? grantsFor(reg, cap).length > 0 : names.some((n) => reg.capabilities.includes(n));
}

/** Certified in production. Legacy registrations without grants are never certified. */
export function isProductionCertified(reg: SupplierRegistration | undefined, cap: SupplierCapability): boolean {
  if (!reg || reg.readiness !== "production") return false;
  return grantsFor(reg, cap).some((g) => g.environment === "production" && g.certified);
}

/** Capabilities a component needs before it can be booked. */
export const BOOKING_REQUIRED: SupplierCapability[] = ["availability", "price", "book"];

export function bookingBlockers(reg: SupplierRegistration | undefined): SupplierCapability[] {
  if (!reg?.grants) {
    // Legacy registration: fall back to the original production+book rule.
    return reg && reg.readiness === "production" && reg.capabilities.includes("book") ? [] : ["book"];
  }
  return BOOKING_REQUIRED.filter((c) => !isProductionCertified(reg, c));
}

export function capabilityMatrix(reg: SupplierRegistration) {
  return CANONICAL_CAPABILITIES.map((c) => {
    const g = grantsFor(reg, c).sort((a, b) => Number(b.certified) - Number(a.certified))[0];
    return {
      capability: c,
      environment: g?.environment ?? null,
      certified: g?.certified ?? false,
      bookingEligible: isProductionCertified(reg, c),
    };
  });
}
