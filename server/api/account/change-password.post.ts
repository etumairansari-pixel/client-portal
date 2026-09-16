import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { createSession, hashPassword, requireUser, revokeAllSessions, verifyPassword } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { sendPasswordChangedEmail } from '~~/server/services/mail';
import { enforceRateLimit } from '~~/server/utils/rate-limit-h3';

const schema = z.object({
	currentPassword: z.string().min(1).max(200),
	newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

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

	// A user may only ever change their own password here. Role, status and
	// organizationId are deliberately not writable through this route.
	const updated = await prisma.user.update({
		where: { id: user.id },
		data: { passwordHash: await hashPassword(body.data.newPassword), mustChangePassword: false },
	});

	// Every other device is signed out; this one gets a fresh session.
	await revokeAllSessions(user.id);
	await createSession(event, updated);
	await sendPasswordChangedEmail(updated);

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'PASSWORD_CHANGED',
		entityType: 'user',
		entityId: user.id,
	});

	return { ok: true };
});
