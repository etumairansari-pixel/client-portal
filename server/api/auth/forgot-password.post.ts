import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { createPasswordResetToken } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { sendPasswordResetEmail } from '~~/server/services/mail';
import { clientIp, enforceRateLimit } from '~~/server/utils/rate-limit-h3';

const schema = z.object({ email: z.string().email() });

export default defineEventHandler(async (event) => {
	enforceRateLimit(event, 'forgotPasswordPerIp', clientIp(event));
	const body = await readValidatedBody(event, schema.safeParse);

	// Always answer the same way. Never reveal whether an account exists.
	const ok = { ok: true };
	if (!body.success) return ok;

	const email = body.data.email.trim().toLowerCase();
	// Per-address limit applies whether or not the account exists.
	enforceRateLimit(event, 'forgotPasswordPerEmail', email);
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user || user.status !== 'ACTIVE') return ok;

	const token = await createPasswordResetToken(user.id);
	await sendPasswordResetEmail(user, token);
	await recordAudit(event, {
		actorUserId: user.id,
		action: 'PASSWORD_RESET_REQUESTED',
		entityType: 'user',
		entityId: user.id,
	});

	return ok;
});
