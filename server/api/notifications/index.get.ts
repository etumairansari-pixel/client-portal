import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	const user = await requireUser(event);

	// Scoped to the recipient. There is no way to read anyone else's.
	const notifications = await prisma.notification.findMany({
		where: { userId: user.id },
		orderBy: { createdAt: 'desc' },
		take: 25,
	});

	// Mongo: a never-set field is not matched by `null`, so check both forms.
	const unread = await prisma.notification.count({
		where: { userId: user.id, OR: [{ readAt: null }, { readAt: { isSet: false } }] },
	});
	return { notifications, unread };
});
