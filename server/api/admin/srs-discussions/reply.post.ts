import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { postMessage } from '~~/server/services/srs';

const schema = z.object({ discussionId: z.string().min(1), body: z.string().min(1) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please write a message' });

	const discussion = await prisma.requirementDiscussion.findUnique({ where: { id: parsed.data.discussionId } });
	if (!discussion) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' });

	await postMessage(event, discussion.id, discussion.organizationId, 'EIRETECH', owner.id, parsed.data.body);
	return { ok: true };
});
