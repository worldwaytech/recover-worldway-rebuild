// TODO(Lovable Cloud): white-label partner storefront lookup by host.
// This stub always returns null so the main Worldway Luxe site renders.
// When Cloud is enabled, restore the createServerFn version that queries the
// `storefronts` table by request host.

export interface StorefrontBranding {
  brandName: string;
  tagline: string;
  heroImageUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  goldColor?: string;
}

export async function getStorefrontByHost(): Promise<StorefrontBranding | null> {
  return null;
}
