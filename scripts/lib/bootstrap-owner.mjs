/**
 * Core of `pnpm bootstrap:owner`, kept free of process/exit side effects so it
 * can be unit-tested with a fake Prisma client.
 */

export const MIN_OWNER_PASSWORD_LENGTH = 12;

/** Validate input. Returns a list of problems (empty = ok). Never echoes the password. */
export function validateOwnerInput({ email, name, password }) {
	const problems = [];
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('OWNER_EMAIL must be a valid email address');
	if (!name || !name.trim()) problems.push('OWNER_NAME is required');
	if (!password || password.length < MIN_OWNER_PASSWORD_LENGTH) {
		problems.push(`OWNER_PASSWORD must be at least ${MIN_OWNER_PASSWORD_LENGTH} characters`);
	}
	if (password && /^(.)\1+$/.test(password)) problems.push('OWNER_PASSWORD is too weak');
	return problems;
}

/**
 * Create the owner. `prisma` needs `user.findUnique` and `user.create`;
 * `hash` is the argon2 hasher. Refuses if any user already has the email.
 */
export async function bootstrapOwner({ email, name, password }, { prisma, hash }) {
	const problems = validateOwnerInput({ email, name, password });
	if (problems.length) return { ok: false, reason: 'invalid', problems };

	const normalizedEmail = email.trim().toLowerCase();
	const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, role: true } });
	if (existing) {
		return { ok: false, reason: 'exists', problems: [`A ${existing.role} account with that email already exists`] };
	}

	const [firstName, ...rest] = name.trim().split(/\s+/);
	const user = await prisma.user.create({
		data: {
			email: normalizedEmail,
			passwordHash: await hash(password),
			firstName,
			lastName: rest.join(' ') || null,
			role: 'OWNER',
			status: 'ACTIVE',
			mustChangePassword: false,
		},
		select: { id: true, email: true },
	});
	return { ok: true, user };
}
