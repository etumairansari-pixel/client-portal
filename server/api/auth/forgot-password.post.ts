import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { createPasswordResetToken } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { sendPasswordResetEmail } from '~~/server/services/mail';

const schema = z.object({ email: z.string().email() });

export default defineEventHandler(async (event) => {
	const body = await readValidatedBody(event, schema.safeParse);

	// Always answer the same way. Never reveal whether an account exists.
	const ok = { ok: true };
	if (!body.success) return ok;

	const email = body.data.email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user || user.status !== 'ACTIVE') return ok;

	const token = await createPasswordResetToken(user.id);
	await sendPasswordResetEmail(user.email, token);
	await recordAudit(event, {
		actorUserId: user.id,
		action: 'PASSWORD_RESET_REQUESTED',
		entityType: 'user',
		entityId: user.id,
	});

	return ok;
});
