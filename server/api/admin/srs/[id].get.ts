import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' });

	const document = await prisma.srsDocument.findUnique({
		where: { id },
		include: {
			organization: { select: { id: true, name: true } },
			project: { select: { id: true, name: true, currentStage: true, readyForDeliveryAt: true } },
			requirements: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { ref: 'asc' }] },
			versions: { orderBy: { versionNumber: 'desc' } },
			attachments: { orderBy: { createdAt: 'asc' } },
			approvals: { orderBy: { createdAt: 'desc' } },
			discussions: { orderBy: { createdAt: 'asc' }, include: { messages: { orderBy: { createdAt: 'asc' } } } },
		},
	});
	if (!document) throw createError({ statusCode: 404, statusMessage: 'Requirements document not found' });

	// The approved scope is shown alongside as reference while authoring.
	const scope = document.scopeId
		? await prisma.scope.findUnique({ where: { id: document.scopeId }, select: { id: true, answers: true, currentVersion: true, approvedAt: true } })
		: null;

	return { document, scope };
});
