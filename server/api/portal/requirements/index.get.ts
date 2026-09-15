import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { getClientSrs } from '~~/server/services/srs';

export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const { projectId } = getQuery(event) as { projectId?: string };

	// getClientSrs filters by organization AND by shared status, so a draft the
	// Owner is still writing is invisible here.
	const doc = await getClientSrs(user.organizationId, projectId);
	if (!doc) return { document: null, versions: [], requirements: [], discussions: [], attachments: [] };

	const [versions, requirements, discussions, attachments] = await Promise.all([
		prisma.srsVersion.findMany({
			where: { srsDocumentId: doc.id, organizationId: user.organizationId },
			orderBy: { versionNumber: 'desc' },
			select: { id: true, versionLabel: true, versionNumber: true, title: true, sentAt: true },
		}),
		prisma.srsRequirement.findMany({
			where: { srsDocumentId: doc.id, organizationId: user.organizationId, state: { not: 'REMOVED' } },
			orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { ref: 'asc' }],
		}),
		prisma.requirementDiscussion.findMany({
			where: { srsDocumentId: doc.id, organizationId: user.organizationId },
			orderBy: { createdAt: 'asc' },
			include: {
				// authorUserId is deliberately not selected: the client sees a
				// side, never an employee identity.
				messages: {
					orderBy: { createdAt: 'asc' },
					select: { id: true, authorSide: true, body: true, createdAt: true },
				},
			},
		}),
		prisma.srsAttachment.findMany({
			where: { srsDocumentId: doc.id, organizationId: user.organizationId },
			orderBy: { createdAt: 'asc' },
			select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
		}),
	]);

	// Strip internal user ids: the client sees the document, never who authored it.
	const { createdById: _c, approvedById: _a, ...document } = doc;
	return { document, versions, requirements, discussions, attachments };
});
