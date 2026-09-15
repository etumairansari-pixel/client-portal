import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';
import { storage } from '~~/server/services/storage';
import { CLIENT_VISIBLE_SRS_STATUSES } from '~~/shared/srs-template';

/** Authorised download. No public URL exists for an SRS attachment. */
export default defineEventHandler(async (event) => {
	const user = await requireUser(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing attachment id' });

	const attachment = await prisma.srsAttachment.findFirst({
		where: user.role === 'OWNER' ? { id } : { id, organizationId: user.organizationId ?? '__none__' },
		include: { srsDocument: { select: { status: true } } },
	});
	if (!attachment) throw createError({ statusCode: 404, statusMessage: 'Attachment not found' });

	// A client may only download once the document has actually been shared.
	if (user.role === 'CLIENT' && !CLIENT_VISIBLE_SRS_STATUSES.includes(attachment.srsDocument.status)) {
		throw createError({ statusCode: 404, statusMessage: 'Attachment not found' });
	}

	const data = await storage.get(attachment.storageKey).catch(() => null);
	if (!data) throw createError({ statusCode: 404, statusMessage: 'Attachment not found' });

	setHeader(event, 'Content-Type', attachment.mimeType);
	setHeader(event, 'Content-Length', attachment.sizeBytes);
	setHeader(event, 'Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '')}"`);
	setHeader(event, 'X-Content-Type-Options', 'nosniff');
	setHeader(event, 'Cache-Control', 'private, no-store');
	return data;
});
