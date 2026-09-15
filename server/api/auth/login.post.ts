import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { createSession, verifyPassword } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';

const schema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export default defineEventHandler(async (event) => {
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({ statusCode: 400, statusMessage: 'Email and password are required' });
	}

	const email = body.data.email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email } });

	// Same response whether the account is missing or the password is wrong,
	// so this endpoint cannot be used to enumerate accounts.
	const invalid = () => createError({ statusCode: 401, statusMessage: 'Invalid email or password' });

	if (!user) {
		// Constant-ish work even on a miss, to avoid a timing signal.
		await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', body.data.password);
		throw invalid();
	}

	if (!(await verifyPassword(user.passwordHash, body.data.password))) throw invalid();

	if (user.status !== 'ACTIVE') {
		throw createError({ statusCode: 403, statusMessage: 'This account is not active. Please contact Eiretech.' });
	}

	await createSession(event, user);
	await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
	await recordAudit(event, { actorUserId: user.id, action: 'USER_LOGIN', entityType: 'user', entityId: user.id });

	return {
		user: {
			id: user.id,
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
			role: user.role,
			organizationId: user.organizationId,
			mustChangePassword: user.mustChangePassword,
		},
		// Where the client app should land after login. A temporary password
		// sends them to the forced change screen first.
		redirect: user.mustChangePassword
			? '/auth/change-password'
			: user.role === 'OWNER'
				? '/admin'
				: '/portal',
	};
});
