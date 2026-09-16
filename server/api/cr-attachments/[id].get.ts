import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';
import { storage, contentDisposition } from '~~/server/services/storage';

/** Authorised download. Owner: any. Client: own organization only, else 404. */
export default defineEventHandler(async (event) => {
	const user = await requireUser(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing attachment id' });

	const attachment = await prisma.changeRequestAttachment.findFirst({
		where: user.role === 'OWNER' ? { id } : { id, organizationId: user.organizationId ?? '__none__' },
	});
	if (!attachment) throw createError({ statusCode: 404, statusMessage: 'Attachment not found' });

	const data = await storage.get(attachment.storageKey).catch(() => null);
	if (!data) throw createError({ statusCode: 404, statusMessage: 'Attachment not found' });

	setHeader(event, 'Content-Type', attachment.mimeType);
	setHeader(event, 'Content-Length', attachment.sizeBytes);
	setHeader(event, 'Content-Disposition', contentDisposition(attachment.originalName));
	setHeader(event, 'X-Content-Type-Options', 'nosniff');
	setHeader(event, 'Cache-Control', 'private, no-store');
	return data;
});
