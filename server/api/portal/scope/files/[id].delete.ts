import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { storage } from '~~/server/services/storage';
import { recordAudit } from '~~/server/services/audit';
import { CLIENT_EDITABLE } from '~~/server/services/scope';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing file id' });

	const file = await prisma.scopeFile.findFirst({
		where: { id, organizationId: user.organizationId },
		include: { scope: true },
	});
	if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' });

	if (!CLIENT_EDITABLE.includes(file.scope.status)) {
		throw createError({ statusCode: 409, statusMessage: 'This scope can no longer be edited' });
	}

	await prisma.scopeFile.delete({ where: { id: file.id } });
	await storage.remove(file.storageKey);

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'SCOPE_FILE_DELETED',
		entityType: 'scope_file',
		entityId: file.id,
		metadata: { originalName: file.originalName },
	});

	return { ok: true };
});
