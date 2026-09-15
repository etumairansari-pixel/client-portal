import { z } from 'zod';
import { requireOwner } from '~~/server/utils/auth';
import { transitionChangeRequest } from '~~/server/services/change-requests';
import { CHANGE_REQUEST_STATUSES } from '~~/shared/delivery';

const schema = z.object({ to: z.enum(CHANGE_REQUEST_STATUSES), note: z.string().max(4000).optional().nullable() });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing change request id' });
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid transition' });

	// Only moves listed in CR_TRANSITIONS are accepted.
	const changeRequest = await transitionChangeRequest(event, owner.id, id, body.data.to, body.data.note);
	return { changeRequest };
});
