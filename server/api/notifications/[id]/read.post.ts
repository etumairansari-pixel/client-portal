import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';

/** Mark one notification read. Scoped to the recipient: another user's id is a silent no-op. */
export default defineEventHandler(async (event) => {
	const user = await requireUser(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' });

	const own = await prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true, readAt: true } });
	if (own && !own.readAt) {
		await prisma.notification.update({ where: { id: own.id }, data: { readAt: new Date() } });
	}
	return { ok: true };
});
