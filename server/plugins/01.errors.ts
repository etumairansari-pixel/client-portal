import { log } from '../utils/log';

/**
 * Server-side error logging. The response body is shaped by Nitro (which hides
 * stacks and internal messages outside development); this hook makes sure the
 * operator still sees a redacted record of every 5xx.
 */
export default defineNitroPlugin((nitro) => {
	nitro.hooks.hook('error', (error, { event }) => {
		const status = (error as { statusCode?: number }).statusCode ?? 500;
		if (status < 500) return;
		const path = event ? `${event.method} ${event.path}` : 'unknown request';
		log.error('http', `${status} on ${path}: ${error.message}`, import.meta.dev ? error.stack : undefined);
	});
});
