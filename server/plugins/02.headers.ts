/**
 * Nuxt's page renderer adds `x-powered-by: Nuxt` after route middleware has
 * run, so it is stripped on the way out rather than in
 * server/middleware/security-headers.ts. Both hooks are used because the
 * renderer sets it on its response object and Nitro then copies it onto the
 * event.
 */
export default defineNitroPlugin((nitro) => {
	nitro.hooks.hook('render:response', (response) => {
		if (response.headers) delete response.headers['x-powered-by'];
	});
	nitro.hooks.hook('beforeResponse', (event) => {
		removeResponseHeader(event, 'x-powered-by');
	});
});
