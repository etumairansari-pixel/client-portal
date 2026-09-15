import { z } from 'zod';
import { requireClient } from '~~/server/utils/auth';
import { clientApprove, getClientScope } from '~~/server/services/scope';

const schema = z.object({ statement: z.string().optional() });

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const body = await readValidatedBody(event, schema.safeParse);

	const scope = await getClientScope(user.organizationId);
	if (!scope) throw createError({ statusCode: 404, statusMessage: 'Scope not found' });

	// Client agreement only. The scope is not APPROVED/locked until the Owner
	// confirms — a client can never set that status themselves.
	const updated = await clientApprove(event, scope, user.id, body.success ? body.data.statement : undefined);
	return { scope: updated };
});
