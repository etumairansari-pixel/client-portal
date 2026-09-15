import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { storage, validateUpload } from '~~/server/services/storage';
import { assertNotLocked } from '~~/server/services/srs';
import { recordAudit } from '~~/server/services/audit';

/** Owner uploads a prepared SRS (PDF/DOCX) or supporting material. */
export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' });

	const doc = await prisma.srsDocument.findUnique({ where: { id } });
	if (!doc) throw createError({ statusCode: 404, statusMessage: 'Requirements document not found' });
	assertNotLocked(doc);

	const parts = await readMultipartFormData(event);
	const filePart = parts?.find((p) => p.name === 'file' && p.filename);
	if (!filePart) throw createError({ statusCode: 400, statusMessage: 'No file received' });

	const mimeType = filePart.type ?? 'application/octet-stream';
	validateUpload(mimeType, filePart.data.byteLength);

	const stored = await storage.put(filePart.data, { organizationId: doc.organizationId });

	const attachment = await prisma.srsAttachment.create({
		data: {
			srsDocumentId: doc.id,
			organizationId: doc.organizationId,
			storageKey: stored.storageKey,
			originalName: filePart.filename!.slice(0, 255),
			mimeType,
			sizeBytes: stored.sizeBytes,
			uploadedById: owner.id,
		},
		select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
	});

	await recordAudit(event, {
		actorUserId: owner.id,
		action: 'SRS_ATTACHMENT_UPLOADED',
		entityType: 'srs_attachment',
		entityId: attachment.id,
		metadata: { originalName: attachment.originalName, sizeBytes: attachment.sizeBytes },
	});

	return { attachment };
});
