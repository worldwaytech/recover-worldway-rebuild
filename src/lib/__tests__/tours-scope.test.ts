import { describe, expect, it } from "vitest";
import {
  classifyWriteScope,
  fallbackMessage,
  isWriteScopeDenied,
  writeScopeLabel,
} from "../tours-scope";

describe("tour supplier write scope", () => {
  it("classifies permission errors as read-only", () => {
    expect(classifyWriteScope(403)).toBe("READ_ONLY");
    expect(classifyWriteScope(401)).toBe("READ_ONLY");
  });

  it("classifies validation errors and successes as booking enabled", () => {
    for (const s of [400, 409, 422, 200, 201]) {
      expect(classifyWriteScope(s)).toBe("BOOKING_ENABLED");
    }
  });

  it("never asserts a scope for transient failures", () => {
    for (const s of [0, 429, 500, 502, 504]) {
      expect(classifyWriteScope(s)).toBe("UNKNOWN");
    }
  });

  it("detects denied writes", () => {
    expect(isWriteScopeDenied(403)).toBe(true);
    expect(isWriteScopeDenied(409)).toBe(false);
  });

  it("labels scopes for admin diagnostics", () => {
    expect(writeScopeLabel("BOOKING_ENABLED")).toBe("Booking enabled");
    expect(writeScopeLabel("READ_ONLY")).toBe("Read only");
    expect(writeScopeLabel("UNKNOWN")).toBe("Unknown");
  });
});

describe("traveller fallback messaging", () => {
  it("never implies a booking exists and never implies a charge", () => {
    const msgs = [
      fallbackMessage({ writeScopeDenied: true, captured: true }),
      fallbackMessage({ writeScopeDenied: true, captured: false }),
      fallbackMessage({ writeScopeDenied: false, captured: true, supplierError: "Supplier down." }),
      fallbackMessage({ writeScopeDenied: false, captured: false, supplierError: "Supplier down." }),
    ];
    for (const m of msgs) {
      expect(m.toLowerCase()).toContain("no booking has been created");
      expect(m).not.toMatch(/confirmed|reference [A-Z0-9]/);
    }
  });

  it("tells captured travellers the desk will follow up", () => {
    expect(fallbackMessage({ writeScopeDenied: true, captured: true })).toContain("travel desk");
  });

  it("asks uncaptured travellers to contact the desk directly", () => {
    expect(fallbackMessage({ writeScopeDenied: true, captured: false })).toContain(
      "concierge@worldwaytravelsgroup.com",
    );
  });
});
