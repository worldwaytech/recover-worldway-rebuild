import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createHmac, createHash } from "node:crypto";
import { relayTarget, signRelayRequest } from "../relay.server";

beforeEach(() => {
  delete process.env["TRIPJACK_RELAY_URL"];
  delete process.env["TRIPJACK_RELAY_SECRET"];
});
afterEach(() => {
  delete process.env["TRIPJACK_RELAY_URL"];
  delete process.env["TRIPJACK_RELAY_SECRET"];
});

describe("TripJack egress relay transport", () => {
  it("is off unless both relay settings exist (direct call unchanged)", async () => {
    expect(await relayTarget("cabs", "POST", "/cabs/v2/quotes", "{}")).toBeNull();
  });
  it("signs exactly like the relay verifies", async () => {
    const secret = "x".repeat(40),
      ts = "1790000000",
      path = "/tripjack/cabs/cabs/v1/booking/details?bookingIds=A1",
      body = "";
    const relay = createHmac("sha256", secret)
      .update(`${ts}\nGET\n${path}\n${createHash("sha256").update(body).digest("hex")}`)
      .digest("hex");
    expect(await signRelayRequest(secret, ts, "GET", path, body)).toBe(relay);
  });
  it("targets the suite-scoped relay path and never puts the key in relay headers", async () => {
    process.env["TRIPJACK_RELAY_URL"] = "https://relay.example/";
    process.env["TRIPJACK_RELAY_SECRET"] = "s".repeat(40);
    const t = await relayTarget("cabs", "POST", "/cabs/v1/google-places", '{"input":"Delhi"}');
    expect(t?.url).toBe("https://relay.example/tripjack/cabs/cabs/v1/google-places");
    expect(Object.keys(t!.headers).sort()).toEqual(["X-Relay-Signature", "X-Relay-Timestamp"]);
  });
});
