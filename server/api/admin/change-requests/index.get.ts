import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

/** Owner-wide change request inbox, newest first. */
export default defineEventHandler(async (event) => {
	await requireOwner(event);
	const { status } = getQuery(event) as { status?: string };
	const changeRequests = await prisma.changeRequest.findMany({
		where: status ? { status: status as never } : {},
		orderBy: { createdAt: 'desc' },
		take: 200,
		include: {
			project: { select: { id: true, name: true } },
			organization: { select: { id: true, name: true } },
			relatedMilestone: { select: { id: true, title: true } },
		},
	});
	return { changeRequests };
});
