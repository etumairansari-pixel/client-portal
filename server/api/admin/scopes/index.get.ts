import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);

	const scopes = await prisma.scope.findMany({
		orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
		include: {
			organization: { select: { id: true, name: true } },
			project: { select: { id: true, name: true } },
			_count: { select: { versions: true, discussions: true, files: true } },
		},
	});

	return { scopes };
});
