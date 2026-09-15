import { requireClient } from '~~/server/utils/auth';
import { clientCreateSchema, createChangeRequest } from '~~/server/services/change-requests';

/**
 * Client raises a change request. The schema whitelists exactly the fields a
 * client may set; status, organizationId, resolvedAt etc. in the body are
 * ignored because they are never read.
 */
export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	const body = await readValidatedBody(event, clientCreateSchema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid request' });

	const cr = await createChangeRequest(event, { id: user.id, organizationId: user.organizationId }, id, body.data);
	const { createdById: _c, ...changeRequest } = cr;
	return { changeRequest };
});
