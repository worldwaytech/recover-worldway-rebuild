import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import {
  HBX_SECRET_NAMES,
  HBX_SUITE_CONFIG,
  HBX_SUITES,
  HBX_HOSTS,
} from "../config";
import {
  backoffDelayMs,
  hotelImageUrl,
  isRetryableStatus,
  normaliseActivity,
  normaliseHotel,
  normaliseHttpError,
  normaliseTransferRoute,
  starsFromCategory,
  text,
} from "../normalize";
import { hbxSignature } from "../client.server";
import {
  hbxActivitySchema,
  hbxHotelSchema,
  hbxTransferRouteSchema,
} from "../types";

describe("HBX config", () => {
  it("declares distinct credential pairs per suite", () => {
    const names = HBX_SUITES.flatMap((s) => [
      HBX_SUITE_CONFIG[s].apiKeySecret,
      HBX_SUITE_CONFIG[s].apiSecretSecret,
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never leaks credential values through the secret manifest", () => {
    expect(HBX_SECRET_NAMES.every((n) => n === n.toUpperCase())).toBe(true);
    expect(HBX_SECRET_NAMES).toContain("HBX_HOTEL_API_KEY");
    expect(HBX_SECRET_NAMES).toContain("HBX_TRANSFER_SECRET");
  });

  it("separates test and live hosts", () => {
    expect(HBX_HOSTS.test).not.toBe(HBX_HOSTS.live);
    expect(HBX_HOSTS.live).toBe("https://api.hotelbeds.com");
  });

  it("caps supplier throughput on every suite", () => {
    for (const suite of HBX_SUITES) {
      expect(HBX_SUITE_CONFIG[suite].rateLimitPerSecond).toBeGreaterThan(0);
      expect(HBX_SUITE_CONFIG[suite].rateLimitPerSecond).toBeLessThanOrEqual(10);
      expect(HBX_SUITE_CONFIG[suite].timeoutMs).toBeGreaterThan(0);
    }
  });
});

describe("HBX signature", () => {
  it("is sha256(apiKey + secret + utcSeconds)", () => {
    const expected = createHash("sha256").update("key" + "secret" + "1700000000").digest("hex");
    expect(hbxSignature("key", "secret", 1700000000)).toBe(expected);
  });

  it("rotates with the timestamp", () => {
    expect(hbxSignature("key", "secret", 1)).not.toBe(hbxSignature("key", "secret", 2));
  });
});

describe("HBX normalisation", () => {
  it("reads localised supplier text", () => {
    expect(text({ content: "Beach hotel" })).toBe("Beach hotel");
    expect(text("plain")).toBe("plain");
    expect(text(undefined)).toBeNull();
  });

  it("derives star ratings from HBX category codes", () => {
    expect(starsFromCategory("5EST")).toBe(5);
    expect(starsFromCategory("4EST")).toBe(4);
    expect(starsFromCategory("H1_5")).toBe(null);
    expect(starsFromCategory(null)).toBeNull();
  });

  it("maps hotel images onto the supplier CDN", () => {
    expect(hotelImageUrl("12/123456/123456a_hb_a_001.jpg")).toContain(
      "photos.hotelbeds.com",
    );
    expect(hotelImageUrl("https://cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
  });

  it("normalises a hotel while preserving the supplier code", () => {
    const raw = hbxHotelSchema.parse({
      code: 12345,
      name: { content: "Gran Hotel" },
      categoryCode: "5EST",
      categoryName: { content: "5 Stars" },
      destinationCode: "PMI",
      destinationName: { content: "Mallorca" },
      countryCode: "ES",
      city: { content: "Palma" },
      coordinates: { latitude: 39.57, longitude: 2.65 },
      images: [{ path: "12/123456/x.jpg", imageTypeCode: "GEN", order: 1 }],
    });
    const product = normaliseHotel(raw, "test");
    expect(product.code).toBe("12345");
    expect(product.name).toBe("Gran Hotel");
    expect(product.starRating).toBe(5);
    expect(product.supplierId).toBe("hbx-group");
    expect(product.environment).toBe("test");
    expect(product.images[0]?.url).toContain("photos.hotelbeds.com");
  });

  it("normalises an activity and a transfer route", () => {
    const activity = normaliseActivity(
      hbxActivitySchema.parse({
        code: "E-ABC-1",
        name: "City tour",
        country: { code: "AE" },
        destination: { code: "DXB", name: "Dubai" },
        currency: "EUR",
        amountsFrom: [{ amount: 120 }],
      }),
      "live",
    );
    expect(activity.code).toBe("E-ABC-1");
    expect(activity.amountFrom).toBe(120);
    expect(activity.environment).toBe("live");

    const route = normaliseTransferRoute(
      hbxTransferRouteSchema.parse({
        id: 99,
        from: { type: "IATA", code: "DXB", description: "Dubai Airport" },
        to: { type: "HOTEL", code: "H1", description: "Atlantis" },
        countryCode: "AE",
      }),
      "live",
    );
    expect(route.fromCode).toBe("DXB");
    expect(route.toName).toBe("Atlantis");
    expect(route.supplierId).toBe("hbx-group");
  });
});

describe("HBX error normalisation", () => {
  it("never echoes supplier internals to travellers", () => {
    const err = normaliseHttpError(401, "Invalid signature for api key ABC123");
    expect(err.message).not.toContain("ABC123");
    expect(err.retryable).toBe(false);
  });

  it("marks throttling and server faults retryable", () => {
    expect(normaliseHttpError(429).retryable).toBe(true);
    expect(normaliseHttpError(503).retryable).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it("uses bounded exponential backoff", () => {
    expect(backoffDelayMs(1)).toBeLessThanOrEqual(backoffDelayMs(3));
    expect(backoffDelayMs(20)).toBeLessThanOrEqual(8000);
  });
});
