import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);
	const { organizationId } = getQuery(event) as { organizationId?: string };

	const projects = await prisma.project.findMany({
		where: organizationId ? { organizationId } : undefined,
		orderBy: { createdAt: 'desc' },
		include: { organization: { select: { id: true, name: true } } },
	});

	return { projects };
});
