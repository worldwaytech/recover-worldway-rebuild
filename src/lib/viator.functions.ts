import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const searchSchema = z.object({
  destination: z.string().max(120).optional(),
  destinationId: z.number().int().positive().optional(),
  q: z.string().max(120).optional(),
  startDate: z.string().max(20).optional(),
  endDate: z.string().max(20).optional(),
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  tags: z.array(z.number().int()).max(20).optional(),
  flags: z.array(z.string().max(40)).max(10).optional(),
  durationMin: z.number().min(0).optional(),
  durationMax: z.number().min(0).optional(),
  ratingMin: z.number().min(0).max(5).optional(),
  confirmationType: z.enum(["INSTANT", "MANUAL"]).optional(),
  sort: z
    .enum(["DEFAULT", "PRICE", "TRAVELER_RATING", "ITINERARY_DURATION", "REVIEW_AVG_RATING"])
    .optional(),
  order: z.enum(["ASCENDING", "DESCENDING"]).optional(),
  page: z.number().int().min(1).max(200).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
  currency: z.string().max(3).optional(),
});

export const searchViatorProducts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { searchViator } = await import("./viator.server");
    return searchViator(data);
  });

export const viatorDestinationSuggest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().max(80), limit: z.number().int().min(1).max(15).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { suggestDestinations, viatorConfigured } = await import("./viator.server");
    if (!viatorConfigured()) return { configured: false, results: [] };
    return { configured: true, results: await suggestDestinations(data.q, data.limit ?? 8) };
  });

export const getViatorConnectorStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { viatorStatus } = await import("./viator.server");
  return viatorStatus();
});

const codeSchema = z.object({
  code: z.string().min(1).max(60),
  currency: z.string().max(3).optional(),
});

export const getViatorProduct = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => codeSchema.parse(d))
  .handler(async ({ data }) => {
    const { viatorProductFull } = await import("./viator.server");
    return viatorProductFull(data.code, data.currency ?? "USD");
  });

export const getViatorReviews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(60),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { viatorReviews } = await import("./viator.server");
    return viatorReviews(data.code, data.limit ?? 6);
  });

export const getViatorSchedule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => codeSchema.parse(d))
  .handler(async ({ data }) => {
    const { viatorSchedule } = await import("./viator.server");
    return viatorSchedule(data.code, data.currency ?? "USD");
  });

export const getViatorCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { viatorTags } = await import("./viator.server");
  const rows = await viatorTags();
  // Real taxonomy categories are root tags that parent many other tags.
  // Plain root tags also include amenity/accessibility labels ("24-Hour Front
  // Desk", "Accessible-height sink"), which are useless as a category facet.
  const childCount = new Map<number, number>();
  for (const t of rows) {
    for (const p of t.parents) childCount.set(p, (childCount.get(p) ?? 0) + 1);
  }
  const roots = rows.filter((t) => t.parents.length === 0 && (childCount.get(t.id) ?? 0) >= 3);
  const source = roots.length >= 8 ? roots : rows.filter((t) => t.parents.length === 0);
  return {
    categories: source
      // never surface supplier branding or operational noise as a facet
      .filter((t) => !/viator|sanitation/i.test(t.name))
      .map((t) => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40),
  };
});
