import { z } from 'zod';
import { requireOwner } from '~~/server/utils/auth';
import { createSrs } from '~~/server/services/srs';

const schema = z.object({ projectId: z.string().min(1) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'A project is required' });

	// Refuses unless the client scope is APPROVED.
	const doc = await createSrs(event, owner.id, body.data.projectId);
	return { document: doc };
});
