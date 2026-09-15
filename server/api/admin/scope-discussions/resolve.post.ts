import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';

const schema = z.object({ discussionId: z.string().min(1) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);

	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Missing discussion id' });

	const discussion = await prisma.scopeDiscussion.findUnique({ where: { id: parsed.data.discussionId } });
	if (!discussion) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' });

	await prisma.scopeDiscussion.update({
		where: { id: discussion.id },
		data: { status: 'RESOLVED', requiresClientResponse: false, resolvedAt: new Date() },
	});

	// Clearing the last blocking thread returns the scope to review.
	const stillBlocking = await prisma.scopeDiscussion.count({
		where: { scopeId: discussion.scopeId, status: 'OPEN', requiresClientResponse: true },
	});
	if (!stillBlocking) {
		const scope = await prisma.scope.findUnique({ where: { id: discussion.scopeId } });
		if (scope && scope.status === 'CLARIFICATION_REQUIRED') {
			await prisma.scope.update({ where: { id: scope.id }, data: { status: 'UNDER_REVIEW' } });
		}
	}

	await recordAudit(event, {
		actorUserId: owner.id,
		action: 'CLARIFICATION_RESOLVED',
		entityType: 'scope_discussion',
		entityId: discussion.id,
	});

	return { ok: true };
});
