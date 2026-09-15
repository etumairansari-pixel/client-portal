/**
 * Route protection.
 *
 * Convenience only — every API route independently re-checks the session, role
 * and password state, so bypassing this middleware gains nothing.
 */
const CHANGE_PASSWORD_PATH = '/auth/change-password';

export default defineNuxtRouteMiddleware(async (to) => {
	const path = to.path;

	const needsOwner = path === '/admin' || path.startsWith('/admin/');
	const needsClient = path === '/portal' || path.startsWith('/portal/');
	const isAuthPage = path.startsWith('/auth/');

	if (!needsOwner && !needsClient && !isAuthPage) return;

	const { user, fetchUser, homeRoute } = useAuth();
	if (!user.value) await fetchUser();

	// Anyone still on a temporary password is pinned to the change screen,
	// including if they type /portal or /admin directly.
	if (user.value?.mustChangePassword && path !== CHANGE_PASSWORD_PATH) {
		return navigateTo(CHANGE_PASSWORD_PATH);
	}

	if (isAuthPage) {
		// Only a signed-in user with a temporary password belongs here.
		if (path === CHANGE_PASSWORD_PATH) {
			if (!user.value) return navigateTo('/auth/signin');
			if (!user.value.mustChangePassword) return navigateTo(homeRoute.value);
			return;
		}
		if (user.value && (path === '/auth/signin' || path === '/auth/')) return navigateTo(homeRoute.value);
		return;
	}

	if (!user.value) {
		return navigateTo({ path: '/auth/signin', query: { redirect: path } });
	}

	if (needsOwner && user.value.role !== 'OWNER') return navigateTo('/portal');
	if (needsClient && user.value.role !== 'CLIENT') return navigateTo('/admin');
});
