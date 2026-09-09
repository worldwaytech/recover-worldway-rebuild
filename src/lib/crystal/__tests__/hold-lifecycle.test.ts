import { afterEach, describe, expect, it } from "vitest";
import { crystalAgentContacts, holdTtlMinutes, isSuiteHeld } from "../booking.server";

const original = process.env["CRYSTAL_HOLD_TTL_MINUTES"];
const originalAgent = process.env["CRYSTAL_BOOKING_AGENT_EMAIL"];
const originalAlt = process.env["CRYSTAL_BOOKING_ALT_AGENT_EMAIL"];
afterEach(() => {
  if (original === undefined) delete process.env["CRYSTAL_HOLD_TTL_MINUTES"];
  else process.env["CRYSTAL_HOLD_TTL_MINUTES"] = original;
  if (originalAgent === undefined) delete process.env["CRYSTAL_BOOKING_AGENT_EMAIL"];
  else process.env["CRYSTAL_BOOKING_AGENT_EMAIL"] = originalAgent;
  if (originalAlt === undefined) delete process.env["CRYSTAL_BOOKING_ALT_AGENT_EMAIL"];
  else process.env["CRYSTAL_BOOKING_ALT_AGENT_EMAIL"] = originalAlt;
});

// Minimal row shape: only status + details are read by isSuiteHeld.
const row = (details: Record<string, unknown>, status = "held") =>
  ({ status, details }) as never;

describe("Crystal suite-hold lifecycle helpers", () => {
  it("defaults the hold window to 30 minutes", () => {
    delete process.env["CRYSTAL_HOLD_TTL_MINUTES"];
    expect(holdTtlMinutes()).toBe(30);
  });

  it("accepts an in-range configured window", () => {
    process.env["CRYSTAL_HOLD_TTL_MINUTES"] = "45";
    expect(holdTtlMinutes()).toBe(45);
  });

  it("rejects out-of-range or non-numeric windows", () => {
    process.env["CRYSTAL_HOLD_TTL_MINUTES"] = "1";
    expect(holdTtlMinutes()).toBe(30);
    process.env["CRYSTAL_HOLD_TTL_MINUTES"] = "5000";
    expect(holdTtlMinutes()).toBe(30);
    process.env["CRYSTAL_HOLD_TTL_MINUTES"] = "abc";
    expect(holdTtlMinutes()).toBe(30);
  });

  it("identifies an outstanding suite hold", () => {
    expect(isSuiteHeld(row({ suiteHeld: true, suiteNumber: 1023 }))).toBe(true);
  });

  it("does not treat confirmed or non-hold rows as suite holds", () => {
    expect(isSuiteHeld(row({ suiteHeld: true }, "confirmed"))).toBe(false);
    expect(isSuiteHeld(row({ suiteHeld: false }))).toBe(false);
    expect(isSuiteHeld(row({}))).toBe(false);
  });
});
