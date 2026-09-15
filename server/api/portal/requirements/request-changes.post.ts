import { z } from 'zod';
import { requireClient } from '~~/server/utils/auth';
import { getClientSrs, requestChanges } from '~~/server/services/srs';

const schema = z.object({
	subject: z.string().min(1, 'Please add a short subject'),
	body: z.string().min(1, 'Please describe the change you need'),
	sectionKey: z.string().optional().nullable(),
	requirementRef: z.string().optional().nullable(),
	projectId: z.string().optional(),
});

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid request' });
	}

	const doc = await getClientSrs(user.organizationId, body.data.projectId);
	if (!doc) throw createError({ statusCode: 404, statusMessage: 'Requirements not found' });

	// The client never edits the Owner document - they open a change thread and
	// the Owner authors the next version.
	const result = await requestChanges(event, doc, user.id, body.data);
	return { document: result.document, discussion: result.discussion };
});
