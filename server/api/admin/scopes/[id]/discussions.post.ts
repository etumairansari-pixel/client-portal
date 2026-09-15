import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { assertNotLocked } from '~~/server/services/scope';
import { recordAudit } from '~~/server/services/audit';
import { notifyOrganizationClients } from '~~/server/services/notifications';

const schema = z.object({
	subject: z.string().min(1, 'A subject is required'),
	body: z.string().min(1, 'A message is required'),
	sectionKey: z.string().optional().nullable(),
	questionKey: z.string().optional().nullable(),
	/** Blocks the client until they reply, and flips the scope status. */
	requiresClientResponse: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing scope id' });

	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid clarification' });
	}

	const scope = await prisma.scope.findUnique({ where: { id } });
	if (!scope) throw createError({ statusCode: 404, statusMessage: 'Scope not found' });
	assertNotLocked(scope);

	const blocking = parsed.data.requiresClientResponse !== false;

	const discussion = await prisma.scopeDiscussion.create({
		data: {
			scopeId: scope.id,
			organizationId: scope.organizationId,
			subject: parsed.data.subject.trim(),
			sectionKey: parsed.data.sectionKey ?? null,
			questionKey: parsed.data.questionKey ?? null,
			requiresClientResponse: blocking,
			openedById: owner.id,
		},
	});

	await prisma.scopeMessage.create({
		data: {
			discussionId: discussion.id,
			organizationId: scope.organizationId,
			authorSide: 'EIRETECH',
			authorUserId: owner.id,
			body: parsed.data.body.trim(),
		},
	});

	// A blocking question moves the whole scope into CLARIFICATION_REQUIRED so
	// the client sees "Action Required" without redoing the form.
	if (blocking) {
		await prisma.scope.update({ where: { id: scope.id }, data: { status: 'CLARIFICATION_REQUIRED' } });
	}

	await recordAudit(event, {
		actorUserId: owner.id,
		action: blocking ? 'CLARIFICATION_REQUESTED' : 'SCOPE_MESSAGE_SENT',
		entityType: 'scope_discussion',
		entityId: discussion.id,
		metadata: { subject: discussion.subject },
	});

	await notifyOrganizationClients(scope.organizationId, {
		type: blocking ? 'CLARIFICATION_REQUIRED' : 'SCOPE_MESSAGE',
		title: blocking ? 'Action required on your scope' : 'New message about your scope',
		body: discussion.subject,
		link: '/portal/scope',
	});

	return { discussion };
});
