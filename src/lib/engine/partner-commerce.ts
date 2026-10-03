import type { PricingChannel } from "./pricing";
import type { BookingScope, BookingActor } from "./booking-orchestration";

export const PARTNER_KINDS = ["agent","dmc","hotel","corporate","airline","tourism_board","ota","affiliate"] as const;
export type PartnerKind = typeof PARTNER_KINDS[number];

export const PARTNER_PRODUCTS = [
  "flights","hotels","transfers","activities","tours","cruises","rail","private_aviation","concierge"
] as const;
export type PartnerProduct = typeof PARTNER_PRODUCTS[number];

export type PartnerStatus = "pending" | "active" | "suspended" | "terminated";
export type CatalogMode = "allow" | "deny";

export interface PartnerCommissionRule {
  product: PartnerProduct;
  percent: number;
  fixedAmount?: number;
  currency?: string;
  maximum?: number;
}

export interface PartnerCatalogRule {
  product: PartnerProduct;
  mode: CatalogMode;
  category?: string;
  externalIds?: readonly string[];
}

export interface PartnerWalletPolicy {
  enabled: boolean;
  currencies: readonly string[];
  allowReserve: boolean;
  allowCredit: boolean;
  creditLimit?: number;
}

export interface PartnerStorefront {
  slug: string;
  host?: string;
  brandName: string;
  tagline?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  enabled: boolean;
}

export interface PartnerProfile {
  id: string;
  name: string;
  kind: PartnerKind;
  status: PartnerStatus;
  pricingChannel: PricingChannel;
  products: readonly PartnerProduct[];
  catalogRules?: readonly PartnerCatalogRule[];
  commissionRules?: readonly PartnerCommissionRule[];
  wallet?: PartnerWalletPolicy;
  storefront?: PartnerStorefront;
}

export interface PartnerCatalogItem {
  id: string;
  product: PartnerProduct;
  category?: string;
  active: boolean;
  price: number;
  currency: string;
}

export interface PartnerPriceInput {
  supplierCost: number;
  customerPrice: number;
  currency: string;
  commissionRule?: PartnerCommissionRule;
}

export interface PartnerPriceResult {
  customerPrice: number;
  commission: number;
  partnerNetRevenue: number;
  currency: string;
  audit: string[];
}

export interface PartnerBookingContext {
  partnerId: string;
  customerId: string;
  currency: string;
  bookingIdempotencyKey: string;
  scopes: readonly BookingScope[];
}

const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\\d+)?$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function finiteNonNegative(n: number, label: string) {
  if (!Number.isFinite(n) || n < 0) throw new Error(label + " must be a finite non-negative number");
}

export function validatePartnerProfile(p: PartnerProfile): string[] {
  const errors: string[] = [];
  if (!p.id.trim()) errors.push("partner id is required");
  if (!p.name.trim()) errors.push("partner name is required");
  if (!PARTNER_KINDS.includes(p.kind)) errors.push("unsupported partner kind");
  if (!p.products.length) errors.push("at least one partner product is required");
  for (const product of p.products) if (!PARTNER_PRODUCTS.includes(product)) errors.push("unsupported product: " + product);
  for (const rule of p.commissionRules ?? []) {
    finiteNonNegative(rule.percent, "commission percent");
    if (rule.percent > 100) errors.push("commission percent cannot exceed 100");
    if (rule.fixedAmount !== undefined) finiteNonNegative(rule.fixedAmount, "commission fixed amount");
    if (rule.maximum !== undefined) finiteNonNegative(rule.maximum, "commission maximum");
  }
  if (p.wallet?.creditLimit !== undefined) finiteNonNegative(p.wallet.creditLimit, "wallet credit limit");
  if (p.storefront) errors.push(...validateStorefront(p.storefront));
  return [...new Set(errors)];
}

export function assertPartnerActive(p: PartnerProfile) {
  if (validatePartnerProfile(p).length) throw new Error("Partner profile is invalid");
  if (p.status !== "active") throw new Error("Partner is not active");
}

export function validateStorefront(s: PartnerStorefront): string[] {
  const errors: string[] = [];
  if (!SLUG_RE.test(s.slug)) errors.push("invalid storefront slug");
  if (!s.brandName.trim()) errors.push("storefront brand name is required");
  if (s.host && !HOST_RE.test(s.host)) errors.push("invalid storefront host");
  if (s.primaryColor && !/^#[0-9a-f]{6}$/i.test(s.primaryColor)) errors.push("primaryColor must be a 6-digit hex color");
  if (s.accentColor && !/^#[0-9a-f]{6}$/i.test(s.accentColor)) errors.push("accentColor must be a 6-digit hex color");
  return errors;
}

function ruleMatches(rule: PartnerCatalogRule, item: PartnerCatalogItem) {
  if (rule.product !== item.product) return false;
  if (rule.category && rule.category.toLowerCase() !== (item.category ?? "").toLowerCase()) return false;
  if (rule.externalIds?.length && !rule.externalIds.includes(item.id)) return false;
  return true;
}

/** Deterministic partner catalogue filtering. Explicit deny rules always win. */
export function filterPartnerCatalogue(p: PartnerProfile, items: readonly PartnerCatalogItem[]): PartnerCatalogItem[] {
  assertPartnerActive(p);
  const allowedProducts = new Set(p.products);
  return items.filter(item => {
    if (!item.active || !allowedProducts.has(item.product)) return false;
    const rules = (p.catalogRules ?? []).filter(r => ruleMatches(r, item));
    if (rules.some(r => r.mode === "deny")) return false;
    const scopedAllows = rules.filter(r => r.mode === "allow");
    const hasAllowRulesForProduct = (p.catalogRules ?? []).some(r => r.product === item.product && r.mode === "allow");
    return !hasAllowRulesForProduct || scopedAllows.length > 0;
  });
}

export function calculatePartnerPrice(input: PartnerPriceInput): PartnerPriceResult {
  finiteNonNegative(input.supplierCost, "supplier cost");
  finiteNonNegative(input.customerPrice, "customer price");
  if (!input.currency.trim()) throw new Error("currency is required");
  const r = input.commissionRule;
  const raw = r ? input.customerPrice * (r.percent / 100) + (r.fixedAmount ?? 0) : 0;
  const commission = round2(r?.maximum === undefined ? raw : Math.min(raw, r.maximum));
  if (commission > input.customerPrice) throw new Error("commission cannot exceed customer price");
  const partnerNetRevenue = round2(input.customerPrice - commission);
  return {
    customerPrice: round2(input.customerPrice),
    commission,
    partnerNetRevenue,
    currency: input.currency,
    audit: [
      "pricing-channel:partner_b2b",
      "commission:" + commission + " " + input.currency,
      "supplier-cost:" + round2(input.supplierCost) + " " + input.currency,
    ],
  };
}

export function commissionFor(p: PartnerProfile, product: PartnerProduct, customerPrice: number, currency: string) {
  const rule = p.commissionRules?.find(r => r.product === product);
  return calculatePartnerPrice({ supplierCost: 0, customerPrice, currency, commissionRule: rule });
}

export function createPartnerBookingActor(ctx: PartnerBookingContext): BookingActor {
  assertPartnerBookingContext(ctx);
  return {
    tenantId: ctx.partnerId,
    actorId: "partner:" + ctx.partnerId,
    scopes: ctx.scopes,
    customerId: ctx.customerId,
  };
}

export function assertPartnerBookingContext(ctx: PartnerBookingContext) {
  if (!ctx.partnerId.trim()) throw new Error("partner id is required");
  if (!ctx.customerId.trim()) throw new Error("customer id is required");
  if (!ctx.bookingIdempotencyKey.trim()) throw new Error("booking idempotency key is required");
  if (!ctx.currency.trim()) throw new Error("currency is required");
  const required: BookingScope[] = ["booking:write","payment:write","booking:read"];
  for (const scope of required) if (!ctx.scopes.includes(scope)) throw new Error("Missing scope: " + scope);
}

export function partnerWalletCanReserve(p: PartnerProfile, currency: string, amount: number) {
  if (validatePartnerProfile(p).length || p.status !== "active") return false;
  finiteNonNegative(amount, "wallet amount");
  const w = p.wallet;
  if (!w?.enabled || !w.allowReserve) return false;
  if (!w.currencies.includes(currency)) return false;
  if (w.allowCredit && w.creditLimit !== undefined && amount > w.creditLimit) return false;
  return true;
}

export const PARTNER_KINDS_SUPPORTED: readonly PartnerKind[] = PARTNER_KINDS;
export const PARTNER_PRODUCTS_SUPPORTED: readonly PartnerProduct[] = PARTNER_PRODUCTS;
