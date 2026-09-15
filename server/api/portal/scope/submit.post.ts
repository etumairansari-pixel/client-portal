import { requireClient } from '~~/server/utils/auth';
import { ensureClientScope, submitScope } from '~~/server/services/scope';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const scope = await ensureClientScope(event, user.organizationId, user.id);
	const updated = await submitScope(event, scope, user.id);
	return { scope: updated };
});
