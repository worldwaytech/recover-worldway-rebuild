import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../client.server", () => ({
  tripjackCredentialStatus: () => ({ configured: true, missing: [] }),
  tripjackCall: vi.fn().mockResolvedValue({ ok: false, correlationId: "cid-503", error: { kind: "http", status: 503, message: "HTTP 503" } }),
}));

import { checkTripjackConnectivity, evidenceStatus, TRIPJACK_EVIDENCE_STEPS } from "../certification.server";

const row = (status: number | null, at: string, outcome = status && status < 300 ? "ok" : "error", error_kind: string | null = null) => ({
  response_status: status,
  created_at: at,
  outcome,
  error_kind,
});

describe("TripJack evidence status", () => {
  it("is EVIDENCE_MISSING with no stored calls", () => {
    expect(evidenceStatus([])).toBe("EVIDENCE_MISSING");
  });
  it("uses the latest call, so an old pass cannot mask a current failure", () => {
    expect(evidenceStatus([row(200, "2026-10-01T10:00:00Z"), row(500, "2026-10-01T11:00:00Z")])).toBe("FAILED");
    expect(evidenceStatus([row(503, "2026-10-01T10:00:00Z"), row(200, "2026-10-01T11:00:00Z")])).toBe("PASS");
  });
  it("classifies 401/403/404/503 as BLOCKED", () => {
    for (const s of [401, 403, 404, 503]) expect(evidenceStatus([row(s, "2026-10-01T10:00:00Z")])).toBe("BLOCKED");
  });
  it("classifies a live Cabs UAT 503 as supplier-side blocked", async () => {
    const [cabs] = await checkTripjackConnectivity();
    expect(cabs.state).toBe("SUPPLIER-SIDE BLOCKED");
    expect(cabs.httpStatus).toBe(503);
    expect(cabs.detail).toContain("HTTP 503");
  });
  it("covers every cab step including amendment charges and cancel", () => {
    const cabs = TRIPJACK_EVIDENCE_STEPS.filter((s) => s.suite === "cabs").flatMap((s) => [...s.capabilities]);
    for (const c of ["location-search", "location-latlong", "quote", "book", "payment", "booking-details", "amend-charges", "cancel"]) {
      expect(cabs).toContain(c);
    }
  });
});
