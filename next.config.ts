import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * Required by the pre-deploy gate in docs/SECURITY.md. Two of these directives
 * do real work for this app specifically rather than being box-ticking:
 *
 *   connect-src 'self'  The browser is not permitted to reach
 *                       api.anthropic.com at all. Architecture rule 3 says no
 *                       API keys in the browser, and this enforces it at the
 *                       one layer that does not depend on us remembering.
 *                       A client component that tried would be blocked.
 *
 *   default-src 'self'  An injected <script src="https://evil/"> cannot load,
 *                       even though inline script is permitted below.
 *
 * Honest limitation: script-src carries 'unsafe-inline'. Next's App Router
 * streams inline hydration scripts, and the strict alternative is a per-request
 * nonce issued from middleware, which forces every page to render dynamically.
 * That is a real cost for a page that is currently static, so the trade is
 * deliberate rather than overlooked. It is recorded in docs/DEBRIEF.md as a gap
 * rather than described as a stricter policy than it is. The residual risk is
 * bounded by there being no `dangerouslySetInnerHTML` anywhere in the tree and
 * by React escaping all model output.
 *
 * style-src carries 'unsafe-inline' too, unavoidably: the equalizer and the
 * allocation bar set bar heights through the `style` attribute.
 */
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' is a Turbopack HMR requirement in dev only.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // Google Fonts stylesheet, per docs/DESIGN.md. Inline styles set bar heights.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  // No third-party egress from the browser. In dev, HMR needs a websocket.
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    // Two years, subdomains included. `preload` is deliberately omitted: it is a
    // commitment that is painful to reverse and belongs with a custom domain,
    // not a preview deployment.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
