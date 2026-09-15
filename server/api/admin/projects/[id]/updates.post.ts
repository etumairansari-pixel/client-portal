import { requireOwner } from '~~/server/utils/auth';
import { updateSchema, postUpdate } from '~~/server/services/project-updates';

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	const body = await readValidatedBody(event, updateSchema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid update' });

	const update = await postUpdate(event, owner.id, id, body.data);
	return { update };
});
