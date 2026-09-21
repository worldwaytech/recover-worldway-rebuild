import { describe, expect, it } from "vitest";
import { assertSafeSupplierUrl, sanitize } from "../engine.server";

describe("assertSafeSupplierUrl", () => {
  it("accepts public HTTPS supplier hosts", () => {
    expect(assertSafeSupplierUrl("https://api.supplier.com/v1/tours").hostname).toBe(
      "api.supplier.com",
    );
  });

  it("rejects non-HTTPS schemes", () => {
    expect(() => assertSafeSupplierUrl("http://api.supplier.com")).toThrow(/HTTPS/);
    expect(() => assertSafeSupplierUrl("file:///etc/passwd")).toThrow();
  });

  it("rejects loopback and internal hostnames", () => {
    for (const url of [
      "https://localhost/v1",
      "https://127.0.0.1/v1",
      "https://service.internal/v1",
      "https://metadata.google.internal/computeMetadata",
    ]) {
      expect(() => assertSafeSupplierUrl(url)).toThrow();
    }
  });

  it("rejects private, link-local and CGNAT IPv4 literals", () => {
    for (const host of ["10.0.0.5", "192.168.1.10", "172.20.0.4", "169.254.169.254", "100.64.0.1"]) {
      expect(() => assertSafeSupplierUrl(`https://${host}/v1`)).toThrow();
    }
  });

  it("rejects malformed URLs", () => {
    expect(() => assertSafeSupplierUrl("not a url")).toThrow();
  });
});

describe("sanitize", () => {
  it("removes credential-bearing keys", () => {
    const out = sanitize({
      name: "Tour",
      apiKey: "secret-value",
      authorization: "Bearer abc",
      password: "hunter2",
    });
    expect(out["name"]).toBe("Tour");
    expect(JSON.stringify(out)).not.toContain("secret-value");
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });

  it("returns JSON-serialisable output for non-plain values", () => {
    const out = sanitize({ when: new Date("2026-01-01T00:00:00.000Z"), nested: { list: [1, 2] } });
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(out["when"]).toBe("2026-01-01T00:00:00.000Z");
  });
});
