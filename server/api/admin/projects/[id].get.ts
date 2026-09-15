import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { projectProgress } from '~~/server/services/project-progress';

/** Everything the Owner project workspace header + tabs need, in one call. */
export default defineEventHandler(async (event) => {
	await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	const project = await prisma.project.findUnique({
		where: { id },
		include: { organization: { select: { id: true, name: true, status: true } } },
	});
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	const orgId = project.organizationId;

	const [scope, srs, milestones, tasks, updates, changeRequests, progress] = await Promise.all([
		prisma.scope.findFirst({
			where: { organizationId: orgId },
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, completionPercentage: true, currentVersion: true, submittedAt: true, approvedAt: true },
		}),
		prisma.srsDocument.findFirst({
			where: { projectId: id },
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, currentVersion: true, title: true, submittedForReviewAt: true, approvedAt: true, lockedAt: true },
		}),
		prisma.milestone.findMany({ where: { projectId: id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
		prisma.projectTask.findMany({
			where: { projectId: id },
			orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
			include: { milestone: { select: { id: true, title: true } } },
		}),
		prisma.projectUpdate.findMany({
			where: { projectId: id },
			orderBy: { createdAt: 'desc' },
			include: { milestone: { select: { id: true, title: true } } },
		}),
		prisma.changeRequest.findMany({
			where: { projectId: id },
			orderBy: { createdAt: 'desc' },
			include: {
				relatedMilestone: { select: { id: true, title: true } },
				messages: { orderBy: { createdAt: 'asc' } },
				attachments: { orderBy: { createdAt: 'asc' } },
			},
		}),
		projectProgress(id, orgId),
	]);

	// Files from every source, one list.
	const [scopeFiles, srsFiles, crFiles] = await Promise.all([
		scope
			? prisma.scopeFile.findMany({
					where: { scopeId: scope.id },
					select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
				})
			: [],
		srs
			? prisma.srsAttachment.findMany({
					where: { srsDocumentId: srs.id },
					select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
				})
			: [],
		prisma.changeRequestAttachment.findMany({
			where: { changeRequest: { projectId: id } },
			select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true, changeRequest: { select: { title: true } } },
		}),
	]);
	const files = [
		...scopeFiles.map((f) => ({ ...f, source: 'Scope', url: `/api/portal/scope/files/${f.id}` })),
		...srsFiles.map((f) => ({ ...f, source: 'Requirements', url: `/api/srs-attachments/${f.id}` })),
		...crFiles.map((f) => ({ ...f, source: `Change request: ${f.changeRequest.title}`, url: `/api/cr-attachments/${f.id}` })),
	].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

	// Activity is scoped to THIS project's entities. Never the global stream.
	const entityIds = new Set<string>([id]);
	if (scope) entityIds.add(scope.id);
	if (srs) {
		entityIds.add(srs.id);
		const [reqIds, attIds, discIds] = await Promise.all([
			prisma.srsRequirement.findMany({ where: { srsDocumentId: srs.id }, select: { id: true } }),
			prisma.srsAttachment.findMany({ where: { srsDocumentId: srs.id }, select: { id: true } }),
			prisma.requirementDiscussion.findMany({ where: { srsDocumentId: srs.id }, select: { id: true } }),
		]);
		for (const r of [...reqIds, ...attIds, ...discIds]) entityIds.add(r.id);
	}
	for (const m of milestones) entityIds.add(m.id);
	for (const t of tasks) entityIds.add(t.id);
	for (const u of updates) entityIds.add(u.id);
	for (const c of changeRequests) entityIds.add(c.id);

	const activity = await prisma.auditLog.findMany({
		where: { entityId: { in: [...entityIds] } },
		orderBy: { createdAt: 'desc' },
		take: 60,
		select: { id: true, action: true, entityType: true, createdAt: true, metadata: true },
	});

	const counts = {
		...progress.milestoneCounts,
		ongoingTasks: tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'UNDER_REVIEW').length,
		blockedTasks: tasks.filter((t) => t.status === 'BLOCKED').length,
		openChangeRequests: changeRequests.filter((c) => c.status !== 'DECLINED' && c.status !== 'COMPLETED').length,
	};

	return {
		project,
		scope,
		srs,
		overallProgress: progress.overallProgress,
		nextMilestone: progress.nextMilestone,
		counts,
		milestones,
		tasks,
		updates,
		changeRequests,
		files,
		activity,
	};
});
