// Neutral Worldway media URLs. Any third-party (supplier) image is served via
// /media/<token> so no supplier domain appears in pages, APIs or MCP output.
// Client-safe: no secrets, pure string transforms.

const PASS_THROUGH_HOSTS = [/(^|\.)worldwaytravelsgroup\.com$/i, /(^|\.)lovable\.app$/i, /^images\.unsplash\.com$/i];

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeMediaToken(token: string): string | null {
  try {
    const bin = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function isThirdPartyUrl(url: string): boolean {
  if (!/^(https?:)?\/\//i.test(url)) return false;
  try {
    const host = new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
    return !PASS_THROUGH_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

/** Worldway-neutral image URL. Relative / Worldway / stock URLs are unchanged. */
export function mediaUrl<T extends string | null | undefined>(url: T, absolute = false): T {
  if (!url || !isThirdPartyUrl(url)) return url;
  const path = `/media/${b64url(url.startsWith("//") ? `https:${url}` : url)}`;
  return (absolute ? `https://worldwaytravelsgroup.com${path}` : path) as T;
}
