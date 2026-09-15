import { z } from 'zod';
import { requireOwner } from '~~/server/utils/auth';
import { reorderMilestones } from '~~/server/services/milestones';

const schema = z.object({ orderedIds: z.array(z.string()).min(1) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid order' });
	await reorderMilestones(event, owner.id, id, body.data.orderedIds);
	return { ok: true };
});
