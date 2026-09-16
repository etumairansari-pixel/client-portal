import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { consumePasswordResetToken, hashPassword, revokeAllSessions } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { sendPasswordChangedEmail } from '~~/server/services/mail';
import { clientIp, enforceRateLimit } from '~~/server/utils/rate-limit-h3';

const schema = z.object({
	token: z.string().min(10),
	password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export default defineEventHandler(async (event) => {
	enforceRateLimit(event, 'resetPasswordPerIp', clientIp(event));
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' });
	}

	// Validates expiry + single use, and burns the token.
	const token = await consumePasswordResetToken(body.data.token);
	if (!token) {
		throw createError({ statusCode: 400, statusMessage: 'This reset link is invalid or has expired' });
	}

	const user = await prisma.user.update({
		where: { id: token.userId },
		data: { passwordHash: await hashPassword(body.data.password), mustChangePassword: false },
	});

	// Anyone holding an old session for this account is logged out.
	await revokeAllSessions(token.userId);
	const invited = token.purpose === 'INVITE';
	await recordAudit(event, {
		actorUserId: token.userId,
		action: invited ? 'PASSWORD_CHANGED' : 'PASSWORD_RESET_COMPLETED',
		entityType: 'user',
		entityId: token.userId,
		metadata: invited ? { reason: 'invitation_accepted' } : undefined,
	});
	// A freshly invited account has no previous password to warn about.
	if (!invited) await sendPasswordChangedEmail(user);

	return { ok: true };
});
