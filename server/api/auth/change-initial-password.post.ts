import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { hashPassword, requireUser, verifyPassword, revokeAllSessions, createSession } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { sendPasswordChangedEmail } from '~~/server/services/mail';
import { enforceRateLimit } from '~~/server/utils/rate-limit-h3';

const schema = z.object({
	currentPassword: z.string().min(1).max(200),
	newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

/**
 * Completes a forced password change for an account flagged
 * `mustChangePassword` (legacy accounts that were handed a password before
 * invitations existed). New clients never reach this route: they choose their
 * password by redeeming an invitation token instead.
 *
 * Every other session for this user is revoked (the previous password may
 * have been shared over email/chat), then a fresh session is issued so the
 * client stays signed in on this device.
 */
export default defineEventHandler(async (event) => {
	const session = await requireUser(event);
	enforceRateLimit(event, 'changePasswordPerUser', session.id);

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid password' });
	}

	const user = await prisma.user.findUnique({ where: { id: session.id } });
	if (!user || !(await verifyPassword(user.passwordHash, body.data.currentPassword))) {
		throw createError({ statusCode: 400, statusMessage: 'Your current password is incorrect' });
	}

	if (await verifyPassword(user.passwordHash, body.data.newPassword)) {
		throw createError({ statusCode: 400, statusMessage: 'Please choose a different password' });
	}

	const updated = await prisma.user.update({
		where: { id: user.id },
		data: { passwordHash: await hashPassword(body.data.newPassword), mustChangePassword: false },
	});

	await revokeAllSessions(user.id);
	await createSession(event, updated);
	await sendPasswordChangedEmail(updated);

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'PASSWORD_CHANGED',
		entityType: 'user',
		entityId: user.id,
		metadata: { reason: 'initial_credential_handover' },
	});

	return { ok: true, redirect: updated.role === 'OWNER' ? '/admin' : '/portal' };
});
