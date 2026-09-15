export type Role = 'OWNER' | 'CLIENT';

export interface AuthUser {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	role: Role;
	status: string;
	organizationId: string | null;
	mustChangePassword: boolean;
}

export interface AuthOrganization {
	id: string;
	name: string;
	status: string;
}

/**
 * Eiretech authentication.
 *
 * The session lives in an httpOnly cookie that JavaScript cannot read, so this
 * composable only ever holds the *profile*, never a token. Every call is
 * re-authorised server-side.
 */
export default function useAuth() {
	const user = useState<AuthUser | null>('eiretech-user', () => null);
	const organization = useState<AuthOrganization | null>('eiretech-org', () => null);

	const isAuthenticated = computed(() => !!user.value);
	const isOwner = computed(() => user.value?.role === 'OWNER');
	const isClient = computed(() => user.value?.role === 'CLIENT');

	const displayName = computed(() => {
		if (!user.value) return '';
		const name = [user.value.firstName, user.value.lastName].filter(Boolean).join(' ').trim();
		return name || user.value.email;
	});

	/** Home route for whoever is signed in. */
	const homeRoute = computed(() => (user.value?.role === 'OWNER' ? '/admin' : '/portal'));

	async function fetchUser() {
		try {
			const data = await $fetch<{ user: AuthUser | null; organization: AuthOrganization | null }>('/api/auth/me', {
				headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
			});
			user.value = data.user;
			organization.value = data.organization;
		} catch {
			user.value = null;
			organization.value = null;
		}
		return user.value;
	}

	async function login(email: string, password: string) {
		const data = await $fetch<{ user: AuthUser; redirect: string }>('/api/auth/login', {
			method: 'POST',
			body: { email, password },
		});
		user.value = data.user;
		await fetchUser();
		return data;
	}

	async function logout() {
		await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
		user.value = null;
		organization.value = null;
		await navigateTo('/auth/signin');
	}

	async function requestPasswordReset(email: string) {
		// Always resolves the same way; the server never reveals whether the
		// address exists.
		await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
	}

	async function resetPassword(token: string, password: string) {
		await $fetch('/api/auth/reset-password', { method: 'POST', body: { token, password } });
	}

	async function changePassword(currentPassword: string, newPassword: string) {
		await $fetch('/api/account/change-password', { method: 'POST', body: { currentPassword, newPassword } });
		await fetchUser();
	}

	return {
		user,
		organization,
		isAuthenticated,
		isOwner,
		isClient,
		displayName,
		homeRoute,
		fetchUser,
		login,
		logout,
		requestPasswordReset,
		resetPassword,
		changePassword,
	};
}
