// Worldway sealed references. Supplier identifiers that the browser must echo
// back (rate keys, result indexes, fare ids, supplier/source fields…) are
// encrypted into opaque "wwr_" tokens. They are deterministic, so equal values
// give equal tokens, and authenticated, so a browser cannot forge them.
// Tokens are unsealed server-side before any handler runs. No database state is kept.

const PREFIX = "wwr_";
const enc = new TextEncoder();
const dec = new TextDecoder();

let keys: Promise<{ aes: CryptoKey; mac: CryptoKey }> | null = null;

function secretMaterial(): string {
  const s = process.env["SUPABASE_SERVICE_ROLE_KEY"] || process.env["WORLDWAY_REF_KEY"];
  if (s) return s;
  if (process.env["VITEST"] || process.env["NODE_ENV"] === "test") return "worldway-test-only-key";
  throw new Error("Reference key unavailable");
}

function getKeys() {
  if (!keys) {
    keys = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secretMaterial()), "HKDF", false, ["deriveKey", "deriveBits"]);
      const salt = enc.encode("worldway-ref-v1");
      const aes = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("aes") },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
      );
      const mac = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("iv") },
        base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"],
      );
      return { aes, mac };
    })();
  }
  return keys;
}

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const cache = new Map<string, string>();

export function isSealed(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(PREFIX) && v.length > 30;
}

/** Seal any JSON value into an opaque Worldway reference. */
export async function seal(value: unknown): Promise<string> {
  if (isSealed(value)) return value as string;
  const plain = JSON.stringify(value);
  const hit = cache.get(plain);
  if (hit) return hit;
  const { aes, mac } = await getKeys();
  const data = enc.encode(plain);
  const iv = new Uint8Array(await crypto.subtle.sign("HMAC", mac, data)).slice(0, 12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  const token = PREFIX + b64u(out);
  if (cache.size > 5000) cache.clear();
  cache.set(plain, token);
  return token;
}

/** Restore a sealed reference. Returns undefined when the token is not genuine. */
export async function unseal(token: string): Promise<unknown> {
  if (!isSealed(token)) return undefined;
  try {
    const raw = unb64u(token.slice(PREFIX.length));
    const { aes } = await getKeys();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, aes, raw.slice(12));
    return JSON.parse(dec.decode(pt));
  } catch {
    return undefined;
  }
}
