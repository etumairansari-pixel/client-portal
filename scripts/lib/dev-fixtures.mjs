/**
 * Development-only fixture accounts.
 *
 * These exist for the local seed and the HTTP test matrices and nowhere else:
 * no runtime code, UI, or production path references this file. Override any
 * value with the matching TEST_* environment variable to run the suites
 * against a differently seeded database.
 */
const env = (name, fallback) => process.env[name] || fallback;

export const OWNER = { email: env('TEST_OWNER_EMAIL', 'owner@eiretech360.com'), password: env('TEST_OWNER_PASSWORD', 'OwnerLocal!2026') };
export const CLIENT_A = {
	email: env('TEST_CLIENT_A_EMAIL', 'clienta@example.com'),
	password: env('TEST_CLIENT_A_PASSWORD', 'ClientALocal!2026'),
	organizationName: 'Client A Ltd',
	projectName: 'Project Alpha',
};
export const CLIENT_B = {
	email: env('TEST_CLIENT_B_EMAIL', 'clientb@example.com'),
	password: env('TEST_CLIENT_B_PASSWORD', 'ClientBLocal!2026'),
	organizationName: 'Client B Ltd',
	projectName: 'Project Beta',
};

/** Every organisation the dev seed and the matrices create. */
export const DEV_ORGANIZATION_NAMES = [CLIENT_A.organizationName, CLIENT_B.organizationName, 'Matrix Test Co'];

/** Every email pattern the dev seed and the matrices create. */
export const DEV_EMAIL_PATTERNS = [OWNER.email, CLIENT_A.email, CLIENT_B.email, /^matrix\+\d+@example\.com$/, /^isolation\+/];

/** Refuse to run destructive dev tooling against a production database. */
export function assertNotProduction(what) {
	if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_DATA !== '1') {
		console.error(`${what} refuses to run with NODE_ENV=production. Set ALLOW_DEV_DATA=1 only if you are certain this is not a production database.`);
		process.exit(2);
	}
}
