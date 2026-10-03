import { describe, expect, it } from "vitest";
import {
  deduplicateExperiences,
  destinationPath,
  normalizeExperienceCategories,
  searchExperienceCatalogue,
  travelShopBaselineHealth,
  validateDestinationHierarchy,
  type DestinationNode,
  type ExperienceRecord,
} from "../experiences-marketplace";

const nodes: DestinationNode[] = [
  { id: "asia", name: "Asia", level: "region" },
  { id: "in", name: "India", level: "country", parentId: "asia" },
  { id: "pb", name: "Punjab", level: "state_province", parentId: "in" },
  { id: "amritsar", name: "Amritsar", level: "city_location", parentId: "pb" },
];

const base: ExperienceRecord = {
  id: "t-1",
  supplierKey: "travelshop",
  externalId: "tour-1",
  title: "Golden Temple Heritage",
  categories: ["historical", "pilgrimage"],
  destinationIds: ["amritsar"],
  quality: 5,
  price: { amount: 100, currency: "EUR" },
  bookable: true,
};

describe("Phase 11 global experiences marketplace", () => {
  it("validates and resolves the destination hierarchy", () => {
    expect(validateDestinationHierarchy(nodes)).toEqual([]);
    const path = destinationPath(nodes[3]!, new Map(nodes.map((x) => [x.id, x])));
    expect(path.map((x) => x.id)).toEqual(["asia", "in", "pb", "amritsar"]);
  });

  it("rejects broken destination parent levels and cycles", () => {
    const broken = [
      ...nodes.slice(0, 2),
      { id: "bad", name: "Bad", level: "city_location" as const, parentId: "asia" },
    ];
    expect(validateDestinationHierarchy(broken).some((x) => x.includes("invalid parent level"))).toBe(true);
    const cycle = [
      { id: "a", name: "A", level: "region" as const, parentId: "b" },
      { id: "b", name: "B", level: "region" as const, parentId: "a" },
    ];
    expect(validateDestinationHierarchy(cycle).some((x) => x.includes("cycle"))).toBe(true);
  });

  it("normalizes the global experience taxonomy", () => {
    expect(normalizeExperienceCategories(["Pilgrimage", "Food & Wine", "culture", "unknown"]))
      .toEqual(["cultural", "food_wine", "pilgrimage"]);
  });

  it("deduplicates by supplier and external id without losing taxonomy", () => {
    const duplicate = { ...base, categories: ["historical" as const, "cultural" as const], destinationIds: ["amritsar", "pb"] };
    const result = deduplicateExperiences([base, duplicate]);
    expect(result).toHaveLength(1);
    expect(result[0]?.categories).toEqual(["cultural", "historical", "pilgrimage"]);
    expect(result[0]?.destinationIds).toEqual(["amritsar", "pb"]);
  });

  it("reconciles the known TravelShop baseline", () => {
    expect(travelShopBaselineHealth(8345, 39863).healthy).toBe(true);
    expect(travelShopBaselineHealth(8344, 39863).healthy).toBe(false);
  });

  it("requires live revalidation before an experience becomes bookable", () => {
    const results = searchExperienceCatalogue([base], new Map(nodes.map((x) => [x.id, x])), {
      destinationIds: ["amritsar"], adults: 2,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.evidence).toBe("catalogue_only");
    expect(results[0]?.bookable).toBe(false);
    expect(results[0]?.reasons).toContain("Live supplier revalidation required before booking");
  });
});
