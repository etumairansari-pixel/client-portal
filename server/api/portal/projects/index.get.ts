import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);

	const projects = await prisma.project.findMany({
		where: { organizationId: user.organizationId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			name: true,
			description: true,
			status: true,
			currentStage: true,
			startDate: true,
			targetDate: true,
			createdAt: true,
		},
	});

	return { projects };
});
