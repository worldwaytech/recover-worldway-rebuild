import { describe, expect, it, vi } from "vitest";
import { inFlightDedupeSize, withInFlightDedupe } from "../request-dedupe";

describe("AI request deduplication", () => {
  it("shares one in-flight promise for identical non-mutating requests", async () => {
    const work = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "ok";
    });

    const [a, b] = await Promise.all([
      withInFlightDedupe("ai-text", ["explanation", "same"], work),
      withInFlightDedupe("ai-text", ["explanation", "same"], work),
    ]);

    expect(a).toBe("ok");
    expect(b).toBe("ok");
    expect(work).toHaveBeenCalledTimes(1);
    expect(inFlightDedupeSize()).toBe(0);
  });

  it("does not share different request identities", async () => {
    const work = vi.fn(async (value: string) => value);
    await expect(withInFlightDedupe("ai-text", ["a"], () => work("a"))).resolves.toBe("a");
    await expect(withInFlightDedupe("ai-text", ["b"], () => work("b"))).resolves.toBe("b");
    expect(work).toHaveBeenCalledTimes(2);
  });
});
