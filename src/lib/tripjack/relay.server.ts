// TripJack UAT egress relay transport (server-only).
//
// TripJack UAT allow-lists one static IPv4 (our GCP gateway). When
// TRIPJACK_RELAY_URL + TRIPJACK_RELAY_SECRET are configured, TripJack UAT
// calls are sent to the relay on that server, which forwards them unchanged to
// the allow-listed TripJack host. Business logic, payloads and the TripJack key
// are untouched; only the transport hop changes. Unset → direct call (as before).
//
// Every relay request is HMAC-SHA256 signed over
//   timestamp \n method \n /tripjack/<suite><path>?<query> \n sha256(body)
// so the relay accepts only our backend, rejects replays (±60s) and tampering.

import type { TripjackSuite } from "./config";

export type RelayTarget = { url: string; headers: Record<string, string> };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export function relayConfigured(): boolean {
  return Boolean(process.env["TRIPJACK_RELAY_URL"] && process.env["TRIPJACK_RELAY_SECRET"]);
}

export async function signRelayRequest(
  secret: string,
  timestamp: string,
  method: string,
  pathWithQuery: string,
  body: string,
): Promise<string> {
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", enc.encode(body)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}\n${method}\n${pathWithQuery}\n${bodyHash}`)));
}

/** Returns the relay URL + auth headers, or null when the relay is not configured. */
export async function relayTarget(
  suite: TripjackSuite,
  method: string,
  pathWithQuery: string,
  body: string,
): Promise<RelayTarget | null> {
  const base = process.env["TRIPJACK_RELAY_URL"];
  const secret = process.env["TRIPJACK_RELAY_SECRET"];
  if (!base || !secret) return null;
  const relayPath = `/tripjack/${suite}${pathWithQuery}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await signRelayRequest(secret, ts, method, relayPath, body);
  return {
    url: `${base.replace(/\/+$/, "")}${relayPath}`,
    headers: { "X-Relay-Timestamp": ts, "X-Relay-Signature": sig },
  };
}
