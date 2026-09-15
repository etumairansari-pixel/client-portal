/**
 * Resolve the session once per server-rendered request so route middleware
 * and pages have `user` available before the first render.
 */
export default defineNuxtPlugin(async () => {
	const { fetchUser } = useAuth();
	await fetchUser();
});
