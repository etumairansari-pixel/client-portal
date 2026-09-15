import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing scope id' });

	// The Owner is not tenant-scoped; they can open any client's scope.
	const scope = await prisma.scope.findUnique({
		where: { id },
		include: {
			organization: { select: { id: true, name: true, status: true } },
			project: { select: { id: true, name: true } },
			versions: { orderBy: { versionNumber: 'desc' } },
			files: { orderBy: { createdAt: 'asc' } },
			approvals: { orderBy: { createdAt: 'desc' } },
			discussions: {
				orderBy: { createdAt: 'asc' },
				include: { messages: { orderBy: { createdAt: 'asc' } } },
			},
		},
	});

	if (!scope) throw createError({ statusCode: 404, statusMessage: 'Scope not found' });
	return { scope };
});
