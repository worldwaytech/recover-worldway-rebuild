import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface StorefrontBranding {
  tenantId: string;
  slug: string;
  host?: string;
  brandName: string;
  tagline: string;
  heroImageUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

const input = z.object({ host: z.string().trim().min(1).max(253) });

/** Server-side white-label lookup. Client-supplied tenant IDs are never trusted. */
export const getStorefrontByHost = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: row, error } = await db
      .from("partner_storefronts")
      .select("tenant_id, slug, host, brand_name, tagline, hero_image_url, logo_url, primary_color, accent_color")
      .eq("host", data.host.toLowerCase())
      .eq("enabled", true)
      .maybeSingle();
    if (error) throw new Error("Storefront lookup failed");
    if (!row) return null;
    const { data: tenant } = await db.from("partner_tenants").select("status").eq("id", row.tenant_id).maybeSingle();
    if (!tenant || tenant.status !== "active") return null;
    return {
      tenantId: row.tenant_id,
      slug: row.slug,
      host: row.host ?? undefined,
      brandName: row.brand_name,
      tagline: row.tagline ?? "",
      heroImageUrl: row.hero_image_url ?? undefined,
      logoUrl: row.logo_url ?? undefined,
      primaryColor: row.primary_color ?? undefined,
      accentColor: row.accent_color ?? undefined,
    } satisfies StorefrontBranding;
  });
