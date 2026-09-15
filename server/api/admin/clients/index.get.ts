import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);

	const organizations = await prisma.organization.findMany({
		orderBy: { createdAt: 'desc' },
		include: {
			users: {
				where: { role: 'CLIENT' },
				select: { id: true, email: true, firstName: true, lastName: true, status: true, lastLoginAt: true },
			},
			_count: { select: { projects: true } },
		},
	});

	return { organizations };
});
