import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { storage, validateUpload } from '~~/server/services/storage';
import { enforceRateLimit } from '~~/server/utils/rate-limit-h3';
import { recordAudit } from '~~/server/services/audit';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	enforceRateLimit(event, 'uploadPerUser', user.id);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing change request id' });

	const cr = await prisma.changeRequest.findFirst({ where: { id, organizationId: user.organizationId } });
	if (!cr) throw createError({ statusCode: 404, statusMessage: 'Change request not found' });
	if (cr.status === 'DECLINED' || cr.status === 'COMPLETED') {
		throw createError({ statusCode: 409, statusMessage: 'This request is closed' });
	}

	const parts = await readMultipartFormData(event);
	const filePart = parts?.find((p) => p.name === 'file' && p.filename);
	if (!filePart) throw createError({ statusCode: 400, statusMessage: 'No file received' });

	const { originalName, mimeType } = validateUpload(filePart);
	const stored = await storage.put(filePart.data, { organizationId: user.organizationId });

	const attachment = await prisma.changeRequestAttachment.create({
		data: {
			changeRequestId: cr.id,
			organizationId: user.organizationId,
			storageKey: stored.storageKey,
			originalName,
			mimeType,
			sizeBytes: stored.sizeBytes,
			uploadedById: user.id,
		},
		select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
	});

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'CHANGE_REQUEST_ATTACHMENT_UPLOADED',
		entityType: 'change_request',
		entityId: cr.id,
		metadata: { originalName: attachment.originalName, sizeBytes: attachment.sizeBytes },
	});

	return { attachment };
});
