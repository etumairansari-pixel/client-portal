import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	// organizationId comes from the session, never from the request.
	const user = await requireClient(event);

	const [activeProjects, projects, organization] = await Promise.all([
		prisma.project.count({ where: { organizationId: user.organizationId, status: 'ACTIVE' } }),
		prisma.project.findMany({
			where: { organizationId: user.organizationId },
			orderBy: [{ targetDate: 'asc' }, { createdAt: 'desc' }],
			take: 5,
			select: { id: true, name: true, currentStage: true, status: true, targetDate: true },
		}),
		prisma.organization.findUnique({
			where: { id: user.organizationId },
			select: { id: true, name: true },
		}),
	]);

	return { stats: { activeProjects }, projects, organization };
});
