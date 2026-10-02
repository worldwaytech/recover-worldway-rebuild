import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supplierPrivacyMiddleware } from "./lib/confidentiality/privacy-middleware";

const securityHeadersMiddleware = createMiddleware().server(async ({ request, next }) => {
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(self), microphone=(self), camera=()");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const path = new URL(request.url).pathname;
  if (path.startsWith("/auth") || path.startsWith("/api/") || path.startsWith("/.mcp/")) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});

const errorMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, supplierPrivacyMiddleware],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));
