import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';

const schema = z.object({ discussionId: z.string().min(1) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Missing discussion id' });

	const discussion = await prisma.requirementDiscussion.findUnique({ where: { id: parsed.data.discussionId } });
	if (!discussion) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' });

	await prisma.requirementDiscussion.update({
		where: { id: discussion.id },
		data: { status: 'RESOLVED', resolvedAt: new Date() },
	});

	await recordAudit(event, {
		actorUserId: owner.id,
		action: 'SRS_DISCUSSION_RESOLVED',
		entityType: 'requirement_discussion',
		entityId: discussion.id,
	});

	return { ok: true };
});
