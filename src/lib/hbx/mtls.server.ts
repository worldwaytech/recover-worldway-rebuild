// Server-only HBX Hotel Booking API mTLS transport.
// HBX requires mutual TLS for hotel availability, CheckRate, booking and
// post-booking operations. Secret values never leave this module.

import https from "https";
import { HBX_HOSTS } from "./config";

export type HbxMtlsEnvironment = "test" | "live";

const SECRET_NAMES = {
  apiKey: "HBX_HOTEL_API_KEY",
  apiSecret: "HBX_HOTEL_SECRET",
  clientCert: "HBX_HOTEL_MTLS_CERT",
  clientKey: "HBX_HOTEL_MTLS_KEY",
  caCert: "HBX_HOTEL_MTLS_CA",
} as const;

export function hbxMtlsCredentialStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing = Object.values(SECRET_NAMES).filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

export function hbxMtlsHost(environment: HbxMtlsEnvironment): string {
  return environment === "live"
    ? "https://api-mtls.hotelbeds.com"
    : "https://api-mtls.test.hotelbeds.com";
}

export function hbxMtlsUrl(
  environment: HbxMtlsEnvironment,
  path: string,
): string {
  return new URL(path, hbxMtlsHost(environment)).toString();
}

export interface HbxMtlsRequestOptions {
  environment: HbxMtlsEnvironment;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

export async function hbxMtlsRequest<T>(
  options: HbxMtlsRequestOptions,
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number | null; error: string }> {
  const credentials = hbxMtlsCredentialStatus();
  if (!credentials.configured) {
    return { ok: false, status: null, error: "HBX hotel mTLS is not configured" };
  }

  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const url = new URL(hbxMtlsUrl(options.environment, options.path));

  return new Promise((resolve) => {
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        cert: process.env[SECRET_NAMES.clientCert],
        key: process.env[SECRET_NAMES.clientKey],
        ca: process.env[SECRET_NAMES.caCert],
        headers: {
          "Api-key": process.env[SECRET_NAMES.apiKey]!,
          "X-Signature": createHbxSignature(
            process.env[SECRET_NAMES.apiKey]!,
            process.env[SECRET_NAMES.apiSecret]!,
          ),
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
        timeout: options.timeoutMs ?? 30_000,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { raw += chunk; });
        response.on("end", () => {
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            resolve({
              ok: false,
              status: response.statusCode ?? null,
              error: `HBX mTLS HTTP ${response.statusCode ?? "unknown"}`,
            });
            return;
          }
          try {
            resolve({
              ok: true,
              status: response.statusCode ?? 200,
              data: (raw ? JSON.parse(raw) : null) as T,
            });
          } catch {
            resolve({ ok: false, status: response.statusCode ?? 502, error: "HBX returned invalid JSON" });
          }
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      resolve({
        ok: false,
        status: null,
        error: error instanceof Error && error.message === "timeout"
          ? "HBX mTLS request timeout"
          : "HBX mTLS request failed",
      });
    });

    if (body) request.write(body);
    request.end();
  });
}

function createHbxSignature(apiKey: string, secret: string): string {
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256")
    .update(`${apiKey}${secret}${Math.floor(Date.now() / 1000)}`)
    .digest("hex");
}

export const HBX_MTLS_SECRET_NAMES = Object.values(SECRET_NAMES);
export const HBX_MTLS_HOSTS = {
  test: "https://api-mtls.test.hotelbeds.com",
  live: "https://api-mtls.hotelbeds.com",
  legacyTest: HBX_HOSTS.test,
  legacyLive: HBX_HOSTS.live,
} as const;
