import { z } from 'zod';
import { requireClient } from '~~/server/utils/auth';
import { ensureClientScope, saveDraft } from '~~/server/services/scope';

const schema = z.object({
	answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])),
	// Autosave passes silent:true so the audit log is not flooded.
	silent: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid answers payload' });

	const scope = await ensureClientScope(event, user.organizationId, user.id);
	const updated = await saveDraft(event, scope, user.id, body.data.answers, { silent: body.data.silent });

	return {
		scope: {
			id: updated.id,
			status: updated.status,
			completionPercentage: updated.completionPercentage,
			lastSavedAt: updated.lastSavedAt,
		},
	};
});
