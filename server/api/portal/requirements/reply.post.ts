import { z } from 'zod';
import { requireClient } from '~~/server/utils/auth';
import { postMessage } from '~~/server/services/srs';

const schema = z.object({ discussionId: z.string().min(1), body: z.string().min(1) });

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please write a reply' });

	// organizationId comes from the session, so another tenant discussion
	// simply does not match and 404s.
	await postMessage(event, parsed.data.discussionId, user.organizationId, 'CLIENT', user.id, parsed.data.body);
	return { ok: true };
});
