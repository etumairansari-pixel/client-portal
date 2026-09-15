import { requireOwner } from '~~/server/utils/auth';
import { milestoneSchema, saveMilestone } from '~~/server/services/milestones';

/** Create or edit (when `milestoneId` is present) a milestone. */
export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	const body = await readValidatedBody(event, milestoneSchema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid milestone' });

	const milestone = await saveMilestone(event, owner.id, id, body.data);
	return { milestone };
});
