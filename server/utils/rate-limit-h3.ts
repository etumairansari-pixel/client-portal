import type { H3Event } from 'h3';
import { createError, getRequestIP, setHeader } from 'h3';
import { limiter, RATE_LIMITS, type RateLimitName } from './rate-limit.ts';

/** Best-effort client address; honours X-Forwarded-For behind the hosting proxy. */
export function clientIp(event: H3Event): string {
	return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
}

/**
 * Apply a named policy to `subject` (an IP, an email, a user id). Throws 429
 * with a Retry-After header when exhausted. The body never says *why* a
 * subject is limited, so it cannot be used to probe whether an email exists.
 */
export function enforceRateLimit(event: H3Event, name: RateLimitName, subject: string) {
	const decision = limiter.hit(`${name}:${subject}`, RATE_LIMITS[name]);
	if (decision.allowed) return;
	setHeader(event, 'Retry-After', decision.retryAfterSeconds);
	throw createError({ statusCode: 429, statusMessage: 'Too many requests. Please wait a moment and try again.' });
}

export function clearRateLimit(name: RateLimitName, subject: string) {
	limiter.reset(`${name}:${subject}`);
}
