import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	// The organizationId predicate is what defeats ID manipulation: a project
	// belonging to another tenant simply does not match, so it 404s rather than
	// leaking its existence.
	const project = await prisma.project.findFirst({
		where: { id, organizationId: user.organizationId },
	});

	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });
	return { project };
});
