import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { notifyOrganizationClients } from '~~/server/services/notifications';

const schema = z.object({ discussionId: z.string().min(1), body: z.string().min(1) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);

	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please write a message' });

	const discussion = await prisma.scopeDiscussion.findUnique({
		where: { id: parsed.data.discussionId },
		include: { scope: true },
	});
	if (!discussion) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' });
	if (discussion.scope.status === 'APPROVED') {
		throw createError({ statusCode: 409, statusMessage: 'This scope is approved and locked' });
	}

	await prisma.scopeMessage.create({
		data: {
			discussionId: discussion.id,
			organizationId: discussion.organizationId,
			authorSide: 'EIRETECH',
			authorUserId: owner.id,
			body: parsed.data.body.trim(),
		},
	});

	await recordAudit(event, {
		actorUserId: owner.id,
		action: 'SCOPE_MESSAGE_SENT',
		entityType: 'scope_discussion',
		entityId: discussion.id,
	});

	await notifyOrganizationClients(discussion.organizationId, {
		type: 'SCOPE_MESSAGE',
		title: 'New message about your scope',
		body: discussion.subject,
		link: '/portal/scope',
	});

	return { ok: true };
});
