import { getEnv, warnings, EnvError } from '../utils/env';
import { log } from '../utils/log';

/**
 * Validate configuration before the first request is served.
 *
 * Nitro never sets NODE_ENV itself, so a built server that was started without
 * one is treated as production — the safe default for cookies, headers and
 * configuration strictness. `nuxt dev` is always development.
 */
export default defineNitroPlugin(() => {
	if (!import.meta.dev && !process.env.NODE_ENV) process.env.NODE_ENV = 'production';
	if (import.meta.dev && !process.env.NODE_ENV) process.env.NODE_ENV = 'development';

	try {
		const env = getEnv();
		log.info(
			'env',
			`configuration ok (${env.NODE_ENV}; mail=${env.mailEnabled ? 'smtp' : 'off'}; storage=${env.STORAGE_DRIVER})`,
		);
		for (const w of warnings) log.warn('env', w);
	} catch (error) {
		if (error instanceof EnvError) {
			for (const p of error.problems) log.error('env', p);
		} else {
			log.error('env', 'unexpected error while reading configuration', error);
		}
		log.error('env', 'refusing to start with invalid configuration');
		process.exit(1);
	}
});
