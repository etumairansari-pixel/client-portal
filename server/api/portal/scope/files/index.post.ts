import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { storage, validateUpload } from '~~/server/services/storage';
import { enforceRateLimit } from '~~/server/utils/rate-limit-h3';
import { recordAudit } from '~~/server/services/audit';
import { ensureClientScope, CLIENT_EDITABLE } from '~~/server/services/scope';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	enforceRateLimit(event, 'uploadPerUser', user.id);
	const scope = await ensureClientScope(event, user.organizationId, user.id);

	if (!CLIENT_EDITABLE.includes(scope.status)) {
		throw createError({ statusCode: 409, statusMessage: 'This scope can no longer be edited' });
	}

	const parts = await readMultipartFormData(event);
	if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No file received' });

	const filePart = parts.find((p) => p.name === 'file' && p.filename);
	if (!filePart) throw createError({ statusCode: 400, statusMessage: 'No file received' });

	const field = (name: string) => parts.find((p) => p.name === name)?.data?.toString() ?? null;

	const { originalName, mimeType } = validateUpload(filePart);

	const stored = await storage.put(filePart.data, { organizationId: user.organizationId });

	const record = await prisma.scopeFile.create({
		data: {
			scopeId: scope.id,
			organizationId: user.organizationId,
			storageKey: stored.storageKey,
			originalName,
			mimeType,
			sizeBytes: stored.sizeBytes,
			sectionKey: field('sectionKey'),
			questionKey: field('questionKey'),
			uploadedById: user.id,
		},
		select: { id: true, originalName: true, mimeType: true, sizeBytes: true, questionKey: true, sectionKey: true },
	});

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'SCOPE_FILE_UPLOADED',
		entityType: 'scope_file',
		entityId: record.id,
		// Filename only — never the bytes.
		metadata: { originalName: record.originalName, sizeBytes: record.sizeBytes },
	});

	return { file: record };
});
