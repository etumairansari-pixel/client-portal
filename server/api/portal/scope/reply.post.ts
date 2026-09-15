import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { notifyOwners } from '~~/server/services/notifications';

const schema = z.object({
	discussionId: z.string().min(1),
	body: z.string().min(1, 'Please write a reply'),
});

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);

	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please write a reply' });

	// Scoped by organization: a discussion from another tenant will not match.
	const discussion = await prisma.scopeDiscussion.findFirst({
		where: { id: parsed.data.discussionId, organizationId: user.organizationId },
		include: { scope: true },
	});
	if (!discussion) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' });
	if (discussion.scope.status === 'APPROVED') {
		throw createError({ statusCode: 409, statusMessage: 'This scope is approved and locked' });
	}

	await prisma.scopeMessage.create({
		data: {
			discussionId: discussion.id,
			organizationId: user.organizationId,
			authorSide: 'CLIENT',
			authorUserId: user.id,
			body: parsed.data.body.trim(),
		},
	});

	await prisma.scopeDiscussion.update({
		where: { id: discussion.id },
		data: { requiresClientResponse: false },
	});

	// If nothing else is waiting on the client, hand the scope back for review.
	const stillWaiting = await prisma.scopeDiscussion.count({
		where: { scopeId: discussion.scopeId, status: 'OPEN', requiresClientResponse: true },
	});
	if (!stillWaiting && discussion.scope.status === 'CLARIFICATION_REQUIRED') {
		await prisma.scope.update({ where: { id: discussion.scopeId }, data: { status: 'UNDER_REVIEW' } });
	}

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'CLARIFICATION_RESPONDED',
		entityType: 'scope_discussion',
		entityId: discussion.id,
	});

	const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
	await notifyOwners({
		type: 'CLARIFICATION_RESPONDED',
		title: 'Client answered a clarification',
		body: `${org?.name ?? 'A client'} replied on "${discussion.subject}".`,
		link: `/admin/scopes/${discussion.scopeId}`,
	});

	return { ok: true, stillWaiting };
});
