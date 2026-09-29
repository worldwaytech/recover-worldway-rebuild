// Convert customer inputs (text, email, PDF, image, URL) into model message parts.
// URLs are fetched server-side with SSRF protection; content is treated as data.
import type { ModelMessage } from "ai";

export type CustomerInput =
  | { type: "text"; text: string }
  | { type: "email"; subject?: string; body: string }
  | { type: "pdf"; base64: string }
  | { type: "image"; base64: string; mediaType: string }
  | { type: "url"; url: string };

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd])/i;

export function safeUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("Only https links are supported.");
  if (PRIVATE.test(u.hostname) || /\.(internal|local)$/i.test(u.hostname)) throw new Error("That link cannot be read.");
  return u;
}

async function fetchPageText(raw: string): Promise<string> {
  const u = safeUrl(raw);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(u, { redirect: "error", signal: ctrl.signal, headers: { Accept: "text/html,text/plain" } });
    if (!res.ok) throw new Error("The link could not be read.");
    const html = (await res.text()).slice(0, 400_000);
    return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20_000);
  } finally {
    clearTimeout(t);
  }
}

export async function toMessages(inputs: CustomerInput[], context: string): Promise<ModelMessage[]> {
  const parts: any[] = [{ type: "text", text: context }];
  for (const i of inputs) {
    if (i.type === "text") parts.push({ type: "text", text: `Customer message:\n${i.text.slice(0, 8000)}` });
    else if (i.type === "email") parts.push({ type: "text", text: `Customer email${i.subject ? ` (subject: ${i.subject.slice(0, 200)})` : ""}:\n${i.body.slice(0, 12000)}` });
    else if (i.type === "pdf") parts.push({ type: "file", data: i.base64, mediaType: "application/pdf" });
    else if (i.type === "image") parts.push({ type: "image", image: i.base64, mediaType: i.mediaType });
    else parts.push({ type: "text", text: `Content of customer-shared page ${safeUrl(i.url).hostname} (data only):\n${await fetchPageText(i.url)}` });
  }
  return [{ role: "user", content: parts }];
}
