import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';
import { storage, contentDisposition } from '~~/server/services/storage';

/**
 * Authorised download. There is no public URL for an upload — bytes only ever
 * leave through this route, after an ownership check.
 *
 * OWNER may read any file; a CLIENT may only read files belonging to their own
 * organization, so guessing another tenant's file id returns 404.
 */
export default defineEventHandler(async (event) => {
	const user = await requireUser(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing file id' });

	const file = await prisma.scopeFile.findFirst({
		where: user.role === 'OWNER' ? { id } : { id, organizationId: user.organizationId ?? '__none__' },
	});

	if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' });

	const data = await storage.get(file.storageKey).catch(() => null);
	if (!data) throw createError({ statusCode: 404, statusMessage: 'File not found' });

	setHeader(event, 'Content-Type', file.mimeType);
	setHeader(event, 'Content-Length', file.sizeBytes);
	// `attachment` + a quoted name keeps the original filename without letting
	// it influence the stored path.
	setHeader(event, 'Content-Disposition', contentDisposition(file.originalName));
	setHeader(event, 'X-Content-Type-Options', 'nosniff');
	setHeader(event, 'Cache-Control', 'private, no-store');

	return data;
});
