/**
 * In-memory sliding-window rate limiter.
 *
 * The application runs as a single Node process (Hostinger), so process memory
 * is the right store: no extra infrastructure, no shared-state bugs. If the
 * app is ever scaled to several processes, replace `store` with a shared one;
 * the public API stays the same.
 *
 * Framework-free core (`RateLimiter`) plus a thin h3 adapter (`enforceRateLimit`).
 */

export interface RateLimitRule {
	/** Maximum hits allowed inside the window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
}

export interface RateLimitDecision {
	allowed: boolean;
	remaining: number;
	/** Seconds until the oldest hit leaves the window (only meaningful when blocked). */
	retryAfterSeconds: number;
}

export class RateLimiter {
	private readonly hits = new Map<string, number[]>();
	private lastSweep = 0;
	private readonly now: () => number;

	constructor(now: () => number = Date.now) {
		this.now = now;
	}

	/** Record a hit and decide. */
	hit(key: string, rule: RateLimitRule): RateLimitDecision {
		const t = this.now();
		this.sweep(t);
		const windowStart = t - rule.windowMs;
		const list = (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);

		if (list.length >= rule.limit) {
			this.hits.set(key, list);
			const retryAfterSeconds = Math.max(1, Math.ceil((list[0] + rule.windowMs - t) / 1000));
			return { allowed: false, remaining: 0, retryAfterSeconds };
		}

		list.push(t);
		this.hits.set(key, list);
		return { allowed: true, remaining: rule.limit - list.length, retryAfterSeconds: 0 };
	}

	/** Forget a key — e.g. clear failed-login attempts after a success. */
	reset(key: string) {
		this.hits.delete(key);
	}

	/** Drop stale keys occasionally so memory stays bounded. */
	private sweep(t: number) {
		if (t - this.lastSweep < 60_000) return;
		this.lastSweep = t;
		for (const [key, list] of this.hits) {
			// Keys are only ever hit with windows ≤ 1h; anything older is garbage.
			const fresh = list.filter((ts) => ts > t - 3_600_000);
			if (fresh.length) this.hits.set(key, fresh);
			else this.hits.delete(key);
		}
	}
}

export const limiter = new RateLimiter();

const MIN = 60_000;

/**
 * Named policies. Generous enough that a real person never sees them; tight
 * enough that credential stuffing and token guessing are impractical.
 */
export const RATE_LIMITS = {
	/** Any login attempt from one address. */
	loginPerIp: { limit: 100, windowMs: 15 * MIN },
	/** Failed attempts against one account (cleared on success). */
	loginFailuresPerEmail: { limit: 10, windowMs: 15 * MIN },
	forgotPasswordPerIp: { limit: 10, windowMs: 15 * MIN },
	forgotPasswordPerEmail: { limit: 3, windowMs: 15 * MIN },
	resetPasswordPerIp: { limit: 10, windowMs: 15 * MIN },
	changePasswordPerUser: { limit: 10, windowMs: 15 * MIN },
	uploadPerUser: { limit: 60, windowMs: 15 * MIN },
	clientCreatePerOwner: { limit: 30, windowMs: 60 * MIN },
	/** Anything else that should not be hammered (health checks etc.). */
	generalPerIp: { limit: 300, windowMs: 1 * MIN },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
