import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { setStatus } from '~~/server/services/scope';
import { notifyOrganizationClients } from '~~/server/services/notifications';

const schema = z.object({ status: z.enum(['UNDER_REVIEW', 'READY_FOR_APPROVAL']) });

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing scope id' });

	const parsed = await readValidatedBody(event, schema.safeParse);
	if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid status transition' });

	const scope = await prisma.scope.findUnique({ where: { id } });
	if (!scope) throw createError({ statusCode: 404, statusMessage: 'Scope not found' });

	const audit = parsed.data.status === 'UNDER_REVIEW' ? 'SCOPE_REVIEW_STARTED' : 'SCOPE_READY_FOR_APPROVAL';
	const updated = await setStatus(event, scope, owner.id, parsed.data.status, audit);

	if (parsed.data.status === 'READY_FOR_APPROVAL') {
		await notifyOrganizationClients(scope.organizationId, {
			type: 'SCOPE_READY_FOR_APPROVAL',
			title: 'Your scope is ready for approval',
			body: 'Please review the final scope and confirm you are happy to proceed.',
			link: '/portal/scope',
		});
	}

	return { scope: updated };
});
