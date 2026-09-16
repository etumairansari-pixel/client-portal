import { prisma } from '~~/server/utils/prisma';
import { clientIp, enforceRateLimit } from '~~/server/utils/rate-limit-h3';

/**
 * Liveness + database reachability for the hosting platform's monitor.
 * Says nothing about configuration, versions, hosts or data volumes.
 */
export default defineEventHandler(async (event) => {
	enforceRateLimit(event, 'generalPerIp', clientIp(event));

	let database: 'up' | 'down' = 'down';
	try {
		await Promise.race([
			prisma.$runCommandRaw({ ping: 1 }),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
		]);
		database = 'up';
	} catch {
		database = 'down';
	}

	const ok = database === 'up';
	setResponseStatus(event, ok ? 200 : 503);
	return { status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString(), database };
});
