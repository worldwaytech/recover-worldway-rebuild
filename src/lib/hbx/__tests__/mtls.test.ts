import { describe, expect, it } from "vitest";
import {
  HBX_MTLS_HOSTS,
  HBX_MTLS_SECRET_NAMES,
  hbxMtlsCredentialStatus,
  hbxMtlsHost,
  hbxMtlsUrl,
} from "../mtls.server";

describe("HBX hotel mTLS boundary", () => {
  it("uses dedicated test and live mTLS hosts", () => {
    expect(HBX_MTLS_HOSTS.test).toBe("https://api-mtls.test.hotelbeds.com");
    expect(HBX_MTLS_HOSTS.live).toBe("https://api-mtls.hotelbeds.com");
    expect(HBX_MTLS_HOSTS.test).not.toBe(HBX_MTLS_HOSTS.live);
  });

  it("keeps all mTLS material server-only", () => {
    expect(HBX_MTLS_SECRET_NAMES).toEqual([
      "HBX_HOTEL_API_KEY",
      "HBX_HOTEL_SECRET",
      "HBX_HOTEL_MTLS_CERT",
      "HBX_HOTEL_MTLS_KEY",
      "HBX_HOTEL_MTLS_CA",
    ]);
  });

  it("fails closed when mTLS credentials are absent", () => {
    const names = HBX_MTLS_SECRET_NAMES;
    const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) delete process.env[name];

    const status = hbxMtlsCredentialStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(names);

    for (const [name, value] of Object.entries(original)) {
      if (value !== undefined) process.env[name] = value;
    }
  });

  it("constructs only the documented mTLS endpoints", () => {
    expect(hbxMtlsHost("test")).toBe(HBX_MTLS_HOSTS.test);
    expect(hbxMtlsHost("live")).toBe(HBX_MTLS_HOSTS.live);
    expect(hbxMtlsUrl("test", "/hotel-api/1.0/hotels")).toBe(
      "https://api-mtls.test.hotelbeds.com/hotel-api/1.0/hotels",
    );
  });
});
