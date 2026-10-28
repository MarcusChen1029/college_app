// HTTP security headers for every page (wired up in next.config.ts).
// The CSP has no nonce: a nonce forces every page to render per request, which would undo
// cacheComponents' static shells. So inline scripts stay allowed ('unsafe-inline' is what
// Next's own bootstrap needs), and the CSP's job is to limit where a page can send data
// (connect-src), what can frame it (frame-ancestors) and the classic injection gadgets.

type Header = { key: string; value: string };

function supabaseOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const u = new URL(supabaseUrl);
    return [u.origin, `wss://${u.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy(opts: { supabaseUrl?: string; dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // College favicons come from Google's favicon service, which redirects to gstatic.
    "img-src": ["'self'", "data:", "blob:", "https://www.google.com", "https://*.gstatic.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabaseOrigins(opts.supabaseUrl)],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: { supabaseUrl?: string; dev: boolean }): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}

// Share links carry their secret token in the path: never send it on as a Referer,
// keep the pages out of search engines and out of shared caches.
export const shareHeaders: Header[] = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];
