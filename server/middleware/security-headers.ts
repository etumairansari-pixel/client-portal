import { getEnv } from '../utils/env';

/**
 * Response security headers.
 *
 * Applied to every response, API and page alike. The CSP is deliberately
 * pragmatic: Nuxt hydrates from an inline script and Nuxt UI/Tailwind emit
 * inline styles, so 'unsafe-inline' stays for script-src and style-src;
 * everything else is pinned to 'self'. Fonts are self-hosted (google-fonts
 * download:true) and icons are served from /api/_nuxt_icon, so no third-party
 * origins are needed at all.
 *
 * In development the Vite client needs websockets and eval, so the CSP is
 * skipped there; the other headers still apply.
 */
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
].join('; ');

export default defineEventHandler((event) => {
	const { isProduction } = getEnv();

	setHeader(event, 'X-Content-Type-Options', 'nosniff');
	setHeader(event, 'X-Frame-Options', 'DENY');
	setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin');
	setHeader(
		event,
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
	);
	setHeader(event, 'Cross-Origin-Opener-Policy', 'same-origin');
	setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin');
	setHeader(event, 'X-Permitted-Cross-Domain-Policies', 'none');

	if (isProduction) {
		setHeader(event, 'Content-Security-Policy', CSP);
		setHeader(event, 'Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
	}

	// API responses are never cacheable by intermediaries.
	if (event.path.startsWith('/api/')) {
		setHeader(event, 'Cache-Control', 'private, no-store');
	}
});
