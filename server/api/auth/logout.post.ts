import { destroySession, getSessionUser } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';

export default defineEventHandler(async (event) => {
	const user = await getSessionUser(event);
	await destroySession(event);
	if (user) await recordAudit(event, { actorUserId: user.id, action: 'USER_LOGOUT' });
	return { ok: true };
});
