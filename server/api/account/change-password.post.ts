import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { hashPassword, requireUser, verifyPassword } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';

const schema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export default defineEventHandler(async (event) => {
	const session = await requireUser(event);

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
	await prisma.user.update({
		where: { id: user.id },
		data: { passwordHash: await hashPassword(body.data.newPassword), mustChangePassword: false },
	});

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'PASSWORD_CHANGED',
		entityType: 'user',
		entityId: user.id,
	});

	return { ok: true };
});
