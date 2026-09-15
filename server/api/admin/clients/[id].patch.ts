import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { setClientStatus } from '~~/server/services/clients';

const schema = z.object({
	name: z.string().min(1).optional(),
	email: z.string().email().optional().nullable(),
	phone: z.string().optional().nullable(),
	website: z.string().optional().nullable(),
	status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing client id' });

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid client details' });

	const { status, ...fields } = body.data;

	if (Object.keys(fields).length) {
		await prisma.organization.update({ where: { id }, data: fields });
		await recordAudit(event, {
			actorUserId: owner.id,
			action: 'CLIENT_UPDATED',
			entityType: 'organization',
			entityId: id,
		});
	}

	// Status changes cascade to the org's users and revoke their sessions.
	if (status) await setClientStatus(event, owner.id, id, status);

	const organization = await prisma.organization.findUnique({ where: { id } });
	return { organization };
});
