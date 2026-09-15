import { z } from 'zod';
import { requireClient } from '~~/server/utils/auth';
import { replyToChangeRequest } from '~~/server/services/change-requests';

const schema = z.object({ body: z.string().trim().min(1, 'Please write a message').max(8000) });

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing change request id' });
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid message' });

	// organizationId from the session pins the lookup; another tenant's id 404s.
	await replyToChangeRequest(event, id, user.organizationId, 'CLIENT', user.id, body.data.body);
	return { ok: true };
});
