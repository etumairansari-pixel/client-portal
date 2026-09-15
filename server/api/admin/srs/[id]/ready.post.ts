import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { markReadyForApproval } from '~~/server/services/srs';

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' });

	const doc = await prisma.srsDocument.findUnique({ where: { id } });
	if (!doc) throw createError({ statusCode: 404, statusMessage: 'Requirements document not found' });

	const document = await markReadyForApproval(event, doc, owner.id);
	return { document };
});
