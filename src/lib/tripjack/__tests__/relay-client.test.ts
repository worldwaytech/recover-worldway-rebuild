import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { createHmac, createHash } from "node:crypto";
import { tripjackCall } from "../client.server";
import { RELAY_ALLOWLIST, relayAllows } from "../relay.server";
import { TRIPJACK_CAPABILITIES, TRIPJACK_API_KEY_SECRET } from "../config";

const SECRET = "r".repeat(48);
const KEY = "uat-key-value-123456";
const ENV = ["TRIPJACK_RELAY_URL", "TRIPJACK_RELAY_SECRET", TRIPJACK_API_KEY_SECRET];

let calls: { url: string; init: RequestInit }[] = [];
beforeEach(() => {
  calls = [];
  process.env[TRIPJACK_API_KEY_SECRET] = KEY;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{"status":{"success":true}}', { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { ENV.forEach((k) => delete process.env[k]); vi.unstubAllGlobals(); vi.useRealTimers(); });
const relayOn = () => { process.env["TRIPJACK_RELAY_URL"] = "https://34-93-108-121.sslip.io"; process.env["TRIPJACK_RELAY_SECRET"] = SECRET; };

describe("TripJack client → relay boundary", () => {
  it("POST: exact relay URL, canonical HMAC, relay headers, apikey forwarded", async () => {
    relayOn();
    vi.useFakeTimers({ now: 1_790_000_000_500, toFake: ["Date"] });
    await tripjackCall("cabs", "location-search", { input: "Delhi" });
    const { url, init } = calls[0];
    expect(url).toBe("https://34-93-108-121.sslip.io/tripjack/cabs/cabs/v1/google-places");
    const h = init.headers as Record<string, string>;
    expect(h["X-Relay-Timestamp"]).toBe("1790000000");
    const canon = `1790000000\nPOST\n/tripjack/cabs/cabs/v1/google-places\n${createHash("sha256").update(init.body as string).digest("hex")}`;
    expect(h["X-Relay-Signature"]).toBe(createHmac("sha256", SECRET).update(canon).digest("hex"));
    expect(h.apikey).toBe(KEY);
    expect(JSON.stringify(h)).not.toContain(SECRET);
  });

  it("GET: query included in signed path, empty body hash", async () => {
    relayOn();
    await tripjackCall("cabs", "booking-details", undefined, { bookingIds: "A1" });
    const { url, init } = calls[0];
    expect(url).toBe("https://34-93-108-121.sslip.io/tripjack/cabs/cabs/v1/booking/details?bookingIds=A1");
    const h = init.headers as Record<string, string>;
    const canon = `${h["X-Relay-Timestamp"]}\nGET\n/tripjack/cabs/cabs/v1/booking/details?bookingIds=A1\n${createHash("sha256").update("").digest("hex")}`;
    expect(h["X-Relay-Signature"]).toBe(createHmac("sha256", SECRET).update(canon).digest("hex"));
  });

  it("fresh timestamp per call → distinct signatures (no replayable reuse)", async () => {
    relayOn();
    vi.useFakeTimers({ now: 1_790_000_000_000, toFake: ["Date"] });
    await tripjackCall("cabs", "location-search", { input: "Delhi" });
    vi.setSystemTime(1_790_000_005_000);
    await tripjackCall("cabs", "location-search", { input: "Delhi" });
    const [a, b] = calls.map((c) => c.init.headers as Record<string, string>);
    expect(Number(b["X-Relay-Timestamp"]) - Number(a["X-Relay-Timestamp"])).toBe(5);
    expect(a["X-Relay-Signature"]).not.toBe(b["X-Relay-Signature"]);
    expect(Math.abs(Number(a["X-Relay-Timestamp"]) - 1_790_000_000)).toBeLessThanOrEqual(60);
  });

  it("partial relay config fails closed (no direct bypass)", async () => {
    process.env["TRIPJACK_RELAY_URL"] = "https://34-93-108-121.sslip.io";
    const r = await tripjackCall("cabs", "location-search", { input: "Delhi" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("routes outside the relay allow-list fail closed when relay is on", async () => {
    relayOn();
    for (const k of ["review", "book"]) {
      const r = await tripjackCall("tripsafe", k, {});
      expect(r.ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("no relay settings → original direct call", async () => {
    await tripjackCall("cabs", "location-search", { input: "Delhi" });
    expect(calls[0].url).toBe("https://apitest-cabs.tripjack.com/cabs/v1/google-places");
  });
});

describe("route alignment with relay allow-list", () => {
  it("every mapped cabs capability is relay-allowed", () => {
    for (const c of TRIPJACK_CAPABILITIES.cabs) if (c.path) expect(relayAllows("cabs", c.method, c.path)).toBe(true);
  });
  it("tripsafe: only review/book are outside the relay allow-list", () => {
    const blocked = TRIPJACK_CAPABILITIES.tripsafe.filter((c) => c.path && !relayAllows("tripsafe", c.method, c.path)).map((c) => c.key);
    expect(blocked.sort()).toEqual(["book", "review"]);
    expect(RELAY_ALLOWLIST.cabs.size).toBe(9);
    expect(RELAY_ALLOWLIST.tripsafe.size).toBe(5);
  });
});
