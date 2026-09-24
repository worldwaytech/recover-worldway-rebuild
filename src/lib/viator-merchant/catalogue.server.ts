/**
 * Merchant sandbox catalogue: freetext search, product details and live
 * availability/pricing. Read-only — safe to call for any visitor.
 */
import { merchantFetch, pick, merchantConfigured } from "@/lib/viator-merchant/client.server";

export type MerchantProductSummary = {
  productCode: string;
  title: string;
  image: string | null;
  rating: number | null;
  reviewCount: number;
  price: number | null;
  currency: string;
  durationLabel: string | null;
  confirmationType: string | null;
};

export type MerchantSearchResult = {
  ok: boolean;
  error?: string;
  totalCount: number;
  products: MerchantProductSummary[];
};

/** Pick the largest image variant (variants are not reliably ordered). */
function bestVariantUrl(image: Record<string, unknown> | undefined): string | null {
  if (!image) return null;
  const variants = pick<Record<string, unknown>[]>(image, ["variants"]) ?? [];
  const sized = variants
    .map((v) => ({ url: pick<string>(v, ["url"]), width: pick<number>(v, ["width"]) ?? 0 }))
    .filter((v): v is { url: string; width: number } => Boolean(v.url));
  if (sized.length === 0) return pick<string>(image, ["url"]) ?? null;
  sized.sort((a, b) => b.width - a.width);
  return sized[0]?.url ?? null;
}

function summarizeProduct(raw: Record<string, unknown>): MerchantProductSummary {
  const images = pick<Record<string, unknown>[]>(raw, ["images"]) ?? [];
  const cover =
    images.find((i) => pick<boolean>(i, ["isCover"]) === true) ?? images[0];
  const image = bestVariantUrl(cover);
  const pricing = pick<Record<string, unknown>>(raw, ["pricing"]);
  const summary = pick<Record<string, unknown>>(pricing, ["summary"]);
  const reviews = pick<Record<string, unknown>>(raw, ["reviews"]);
  const duration = pick<Record<string, unknown>>(raw, ["duration"]);
  return {
    productCode: pick<string>(raw, ["productCode"]) ?? "",
    title: pick<string>(raw, ["title"]) ?? "Experience",
    image,
    rating: pick<number>(reviews, ["combinedAverageRating"]) ?? null,
    reviewCount: pick<number>(reviews, ["totalReviews"]) ?? 0,
    price: pick<number>(summary, ["fromPrice"]) ?? null,
    currency: pick<string>(raw, ["currency"]) ?? "USD",
    durationLabel: pick<string>(duration, ["fixedDurationInMinutes"])
      ? `${Math.round(Number(duration?.["fixedDurationInMinutes"]) / 60)}h`
      : (pick<string>(duration, ["unstructuredDuration"]) ?? null),
    confirmationType: pick<string>(raw, ["confirmationType"]) ?? null,
  };
}

export async function merchantSearch(input: {
  query: string;
  count?: number;
}): Promise<MerchantSearchResult> {
  if (!merchantConfigured()) {
    return { ok: false, error: "Supplier not configured.", totalCount: 0, products: [] };
  }
  const res = await merchantFetch<Record<string, unknown>>("/search/freetext", {
    method: "POST",
    body: {
      searchTerm: input.query,
      searchTypes: [
        { searchType: "PRODUCTS", pagination: { start: 1, count: input.count ?? 24 } },
      ],
      currency: "USD",
    },
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      ...(res.error ? { error: res.error } : {}),
      totalCount: 0,
      products: [],
    };
  }
  const block = pick<Record<string, unknown>>(res.data, ["products"]) ?? {};
  const results = pick<Record<string, unknown>[]>(block, ["results"]) ?? [];
  return {
    ok: true,
    totalCount: pick<number>(block, ["totalCount"]) ?? results.length,
    products: results.map(summarizeProduct).filter((p) => p.productCode),
  };
}

export type MerchantProductDetail = {
  ok: boolean;
  error?: string;
  product?: {
    productCode: string;
    title: string;
    description: string;
    images: string[];
    rating: number | null;
    reviewCount: number;
    currency: string;
    priceFrom: number | null;
    confirmationType: string | null;
    languageGuides: { type: string; language: string }[];
    bookingQuestions: string[];
    cancellationDescription: string | null;
  };
};

export async function merchantProduct(code: string): Promise<MerchantProductDetail> {
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) {
    return { ok: false, error: "Invalid product code." };
  }
  const res = await merchantFetch<Record<string, unknown>>(
    `/products/${encodeURIComponent(code)}`,
    { method: "GET" },
  );
  if (!res.ok || !res.data) {
    return { ok: false, ...(res.error ? { error: res.error } : {}) };
  }
  const raw = res.data;
  const images = (pick<Record<string, unknown>[]>(raw, ["images"]) ?? [])
    .map((i) => bestVariantUrl(i))
    .filter((u): u is string => Boolean(u))
    .slice(0, 8);
  const pricing = pick<Record<string, unknown>>(raw, ["pricing"]);
  const summary = pick<Record<string, unknown>>(pricing, ["summary"]);
  const reviews = pick<Record<string, unknown>>(raw, ["reviews"]);
  const guides = (pick<Record<string, unknown>[]>(raw, ["languageGuides"]) ?? [])
    .map((g) => ({
      type: pick<string>(g, ["type"]) ?? "GUIDE",
      language: pick<string>(g, ["language"]) ?? "en",
    }))
    .filter((g) => g.language);
  const cancellation = pick<Record<string, unknown>>(raw, ["cancellationPolicy"]);
  return {
    ok: true,
    product: {
      productCode: pick<string>(raw, ["productCode"]) ?? code,
      title: pick<string>(raw, ["title"]) ?? "Experience",
      description: pick<string>(raw, ["description"]) ?? "",
      images,
      rating: pick<number>(reviews, ["combinedAverageRating"]) ?? null,
      reviewCount: pick<number>(reviews, ["totalReviews"]) ?? 0,
      currency: pick<string>(raw, ["currency"]) ?? "USD",
      priceFrom: pick<number>(summary, ["fromPrice"]) ?? null,
      confirmationType: pick<string>(raw, ["confirmationType"]) ?? null,
      languageGuides: guides,
      bookingQuestions: pick<string[]>(raw, ["bookingQuestions"]) ?? [],
      cancellationDescription: pick<string>(cancellation, ["description"]) ?? null,
    },
  };
}

export type MerchantSlot = {
  productOptionCode: string;
  startTime: string | null;
  available: boolean;
  /** Customer-facing total (recommended retail). */
  retailTotal: number | null;
  currency: string;
};

export async function merchantAvailability(input: {
  productCode: string;
  travelDate: string;
  paxMix: { ageBand: string; count: number }[];
}): Promise<{ ok: boolean; error?: string; currency: string; slots: MerchantSlot[] }> {
  const res = await merchantFetch<Record<string, unknown>>("/availability/check", {
    method: "POST",
    body: {
      productCode: input.productCode,
      travelDate: input.travelDate,
      currency: "USD",
      paxMix: input.paxMix.map((p) => ({
        ageBand: p.ageBand,
        numberOfTravelers: p.count,
      })),
    },
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      ...(res.error ? { error: res.error } : {}),
      currency: "USD",
      slots: [],
    };
  }
  const items = pick<Record<string, unknown>[]>(res.data, ["bookableItems"]) ?? [];
  const slots: MerchantSlot[] = items.map((item) => {
    const total = pick<Record<string, unknown>>(item, ["totalPrice"]);
    const price = pick<Record<string, unknown>>(total, ["price"]) ?? total;
    return {
      productOptionCode: pick<string>(item, ["productOptionCode"]) ?? "DEFAULT",
      startTime: pick<string>(item, ["startTime"]) ?? null,
      available: pick<boolean>(item, ["available"]) === true,
      retailTotal: pick<number>(price, ["recommendedRetailPrice"]) ?? null,
      currency: pick<string>(res.data, ["currency"]) ?? "USD",
    };
  });
  return { ok: true, currency: pick<string>(res.data, ["currency"]) ?? "USD", slots };
}
