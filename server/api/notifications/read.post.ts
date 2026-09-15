import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	const user = await requireUser(event);
	await prisma.notification.updateMany({
		where: { userId: user.id, OR: [{ readAt: null }, { readAt: { isSet: false } }] },
		data: { readAt: new Date() },
	});
	return { ok: true };
});
