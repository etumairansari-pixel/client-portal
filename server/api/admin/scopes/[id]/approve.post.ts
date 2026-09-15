import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { ownerApprove } from '~~/server/services/scope';

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing scope id' });

	const scope = await prisma.scope.findUnique({ where: { id } });
	if (!scope) throw createError({ statusCode: 404, statusMessage: 'Scope not found' });

	// Final confirmation: sets APPROVED + lockedAt, after which nothing edits it.
	const updated = await ownerApprove(event, scope, owner.id);
	return { scope: updated };
});
