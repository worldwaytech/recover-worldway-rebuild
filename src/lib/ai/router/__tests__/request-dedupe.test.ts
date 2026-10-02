import { describe, expect, it, vi } from "vitest";
import { inFlightDedupeSize, withInFlightDedupe } from "../request-dedupe";

describe("AI in-flight request deduplication", () => {
  it("shares an identical in-flight request and removes it after completion", async () => {
    let release!: (value: string) => void;
    const work = new Promise<string>((resolve) => { release = resolve; });
    const fn = vi.fn(() => work);

    const first = withInFlightDedupe("ai-text", ["same"], fn);
    const second = withInFlightDedupe("ai-text", ["same"], fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(inFlightDedupeSize()).toBe(1);

    release("ok");

    await expect(first).resolves.toBe("ok");
    await expect(second).resolves.toBe("ok");
    expect(inFlightDedupeSize()).toBe(0);
  });

  it("does not share different request fingerprints", async () => {
    const fn = vi.fn(async (value: string) => value);

    await expect(withInFlightDedupe("ai-text", ["one"], () => fn("one"))).resolves.toBe("one");
    await expect(withInFlightDedupe("ai-text", ["two"], () => fn("two"))).resolves.toBe("two");

    expect(fn).toHaveBeenCalledTimes(2);
    expect(inFlightDedupeSize()).toBe(0);
  });
});
