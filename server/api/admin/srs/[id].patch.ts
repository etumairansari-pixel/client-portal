import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { assertOwnerEditable } from '~~/server/services/srs';
import { recordAudit } from '~~/server/services/audit';

const schema = z.object({
	title: z.string().min(1).optional(),
	content: z.record(z.string(), z.string()).optional(),
	silent: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' });

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid document payload' });

	const doc = await prisma.srsDocument.findUnique({ where: { id } });
	if (!doc) throw createError({ statusCode: 404, statusMessage: 'Requirements document not found' });
	assertOwnerEditable(doc);

	const document = await prisma.srsDocument.update({
		where: { id },
		data: {
			...(body.data.title ? { title: body.data.title } : {}),
			...(body.data.content ? { content: body.data.content } : {}),
		},
	});

	// Autosave passes silent:true so the audit log is not flooded.
	if (!body.data.silent) {
		await recordAudit(event, { actorUserId: owner.id, action: 'SRS_DRAFT_SAVED', entityType: 'srs_document', entityId: id });
	}

	return { document };
});
