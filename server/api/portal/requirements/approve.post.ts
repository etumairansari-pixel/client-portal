import { z } from 'zod';
import { requireClient } from '~~/server/utils/auth';
import { clientApproveSrs, getClientSrs } from '~~/server/services/srs';

const schema = z.object({ statement: z.string().optional(), projectId: z.string().optional() });

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const body = await readValidatedBody(event, schema.safeParse);

	const doc = await getClientSrs(user.organizationId, body.success ? body.data.projectId : undefined);
	if (!doc) throw createError({ statusCode: 404, statusMessage: 'Requirements not found' });

	const document = await clientApproveSrs(event, doc, user.id, body.success ? body.data.statement : undefined);
	return { document };
});
