import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const filterSchema = z.object({
  kind: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  destination: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  region: z.string().max(60).optional(),
  travelStyle: z.string().max(60).optional(),
  interest: z.string().max(60).optional(),
  theme: z.string().max(60).optional(),
  supplier: z.string().max(120).optional(),
  luxuryLevel: z.string().max(30).optional(),
  groupSize: z.string().max(30).optional(),
  departureMonth: z.string().max(20).optional(),
  durationMin: z.number().int().min(0).max(400).optional(),
  durationMax: z.number().int().min(0).max(400).optional(),
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  minRating: z.number().min(0).max(5).optional(),
  familyFriendly: z.boolean().optional(),
  accessible: z.boolean().optional(),
  availableOnly: z.boolean().optional(),
  sort: z.string().max(20).optional(),
  page: z.number().int().min(1).max(500).optional(),
  pageSize: z.number().int().min(1).max(48).optional(),
});

export const listCatalogueProducts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { queryCatalogue } = await import("./catalogue-engine");
    return queryCatalogue(data as never);
  });

export const getCatalogueProduct = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ kind: z.string().max(40), slug: z.string().max(120) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getCatalogueProductBySlug, relatedProducts } = await import("./catalogue-engine");
    const product = getCatalogueProductBySlug(data.kind as never, data.slug);
    if (!product) return { product: null, related: [] };
    return { product, related: relatedProducts(product) };
  });

export const searchCatalogue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ q: z.string().max(120), limit: z.number().int().min(1).max(48).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { globalSearch, searchSuggestions, POPULAR_SEARCHES } =
      await import("./catalogue-engine");
    return {
      ...globalSearch(data.q, data.limit ?? 24),
      suggestions: searchSuggestions(data.q),
      popular: POPULAR_SEARCHES,
    };
  });
