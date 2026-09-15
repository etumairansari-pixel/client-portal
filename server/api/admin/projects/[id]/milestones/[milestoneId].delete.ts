import { requireOwner } from '~~/server/utils/auth';
import { deleteMilestone } from '~~/server/services/milestones';

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	const milestoneId = getRouterParam(event, 'milestoneId');
	if (!id || !milestoneId) throw createError({ statusCode: 400, statusMessage: 'Missing id' });
	await deleteMilestone(event, owner.id, id, milestoneId);
	return { ok: true };
});
