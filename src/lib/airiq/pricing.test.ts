import { afterEach, describe, expect, it, vi } from "vitest";
import { airiqBook, customerTotal, fareTotal, WORLDWAY_MARKUP_PERCENT } from "./client.server";

describe("pre-purchased flight pricing", () => {
  it("applies the 5% Worldway markup server-side", () => {
    expect(WORLDWAY_MARKUP_PERCENT).toBe(5);
    const f = { price: 3837.75, infantPrice: 1500 };
    const pax = { adult: 2, child: 1, infant: 1 };
    expect(fareTotal(f, pax)).toBe(3837.75 * 3 + 1500);
    expect(customerTotal(f, pax)).toBe(Math.ceil((3837.75 * 3 + 1500) * 1.05));
  });
});

describe("ticketing gate (mocked final step)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("never calls the supplier when ticketing is not authorised", async () => {
    vi.stubEnv("AIRIQ_BOOKING_ENABLED", "");
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(
      airiqBook({ ticketId: "x", pax: { adult: 1, child: 0, infant: 0 }, adults: [], children: [], infants: [] }),
    ).rejects.toThrow(/not authorised/);
    expect(spy).not.toHaveBeenCalled();
  });
});
