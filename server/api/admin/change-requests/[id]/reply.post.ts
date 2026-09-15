import { z } from 'zod';
import { requireOwner } from '~~/server/utils/auth';
import { replyToChangeRequest } from '~~/server/services/change-requests';

const schema = z.object({ body: z.string().trim().min(1, 'Please write a message').max(8000) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing change request id' });
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid message' });
	await replyToChangeRequest(event, id, null, 'EIRETECH', owner.id, body.data.body);
	return { ok: true };
});
