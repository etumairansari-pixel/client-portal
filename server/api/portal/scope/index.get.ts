import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { ensureClientScope } from '~~/server/services/scope';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const scope = await ensureClientScope(event, user.organizationId, user.id);

	const [versions, files, discussions] = await Promise.all([
		prisma.scopeVersion.findMany({
			where: { scopeId: scope.id, organizationId: user.organizationId },
			orderBy: { versionNumber: 'desc' },
			select: { id: true, versionNumber: true, submittedAt: true },
		}),
		prisma.scopeFile.findMany({
			where: { scopeId: scope.id, organizationId: user.organizationId },
			orderBy: { createdAt: 'asc' },
			select: { id: true, originalName: true, mimeType: true, sizeBytes: true, questionKey: true, sectionKey: true },
		}),
		prisma.scopeDiscussion.findMany({
			where: { scopeId: scope.id, organizationId: user.organizationId },
			orderBy: { createdAt: 'asc' },
			include: {
				messages: {
					orderBy: { createdAt: 'asc' },
					// authorUserId is deliberately NOT selected: clients see a side,
					// never an employee identity.
					select: { id: true, authorSide: true, body: true, createdAt: true },
				},
			},
		}),
	]);

	return { scope, versions, files, discussions };
});
