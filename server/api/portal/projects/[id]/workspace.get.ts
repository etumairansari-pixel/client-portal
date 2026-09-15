import { prisma } from '~~/server/utils/prisma';
import { requireClient } from '~~/server/utils/auth';
import { CLIENT_VISIBLE_SRS_STATUSES } from '~~/shared/srs-template';
import { projectProgress, CLIENT_MILESTONE_SELECT, CLIENT_TASK_SELECT } from '~~/server/services/project-progress';
import { CLIENT_UPDATE_SELECT } from '~~/server/services/project-updates';
import { CLIENT_CR_SELECT } from '~~/server/services/change-requests';

/**
 * Client project workspace. Every query is pinned to the session organization,
 * so a project id from another tenant simply 404s.
 *
 * PRIVACY: every list below uses an explicit `select`. No employee ids or
 * names, no internal-only rows (clientVisible=false), no audit metadata.
 */
export default defineEventHandler(async (event) => {
	const user = await requireClient(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });
	const orgId = user.organizationId;

	const project = await prisma.project.findFirst({
		where: { id, organizationId: orgId },
		select: {
			id: true,
			name: true,
			description: true,
			status: true,
			currentStage: true,
			health: true,
			healthReason: true,
			startDate: true,
			targetDate: true,
			readyForDeliveryAt: true,
			organization: { select: { id: true, name: true } },
		},
	});
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	const [scope, srs, progress, milestones, tasks, updates, changeRequests] = await Promise.all([
		prisma.scope.findFirst({
			where: { organizationId: orgId },
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, completionPercentage: true, currentVersion: true, approvedAt: true },
		}),
		prisma.srsDocument.findFirst({
			where: { projectId: id, organizationId: orgId, status: { in: CLIENT_VISIBLE_SRS_STATUSES as never[] } },
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, currentVersion: true, title: true, approvedAt: true, lockedAt: true },
		}),
		projectProgress(id, orgId),
		prisma.milestone.findMany({
			where: { projectId: id, organizationId: orgId, clientVisible: true },
			orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
			select: CLIENT_MILESTONE_SELECT,
		}),
		prisma.projectTask.findMany({
			where: { projectId: id, organizationId: orgId, clientVisible: true },
			orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
			select: CLIENT_TASK_SELECT,
		}),
		prisma.projectUpdate.findMany({
			where: { projectId: id, organizationId: orgId, clientVisible: true },
			orderBy: { createdAt: 'desc' },
			select: CLIENT_UPDATE_SELECT,
		}),
		prisma.changeRequest.findMany({
			where: { projectId: id, organizationId: orgId },
			orderBy: { createdAt: 'desc' },
			select: CLIENT_CR_SELECT,
		}),
	]);

	// Files the client is allowed to see: their own scope files, shared SRS
	// attachments, and their change request attachments.
	const [scopeFiles, srsFiles] = await Promise.all([
		scope
			? prisma.scopeFile.findMany({
					where: { scopeId: scope.id, organizationId: orgId },
					select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
				})
			: [],
		srs
			? prisma.srsAttachment.findMany({
					where: { srsDocumentId: srs.id, organizationId: orgId },
					select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
				})
			: [],
	]);
	const files = [
		...scopeFiles.map((f) => ({ ...f, source: 'Scope', url: `/api/portal/scope/files/${f.id}` })),
		...srsFiles.map((f) => ({ ...f, source: 'Requirements', url: `/api/srs-attachments/${f.id}` })),
		...changeRequests.flatMap((c) =>
			c.attachments.map((f) => ({ ...f, source: `Change request: ${c.title}`, url: `/api/cr-attachments/${f.id}` })),
		),
	].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

	// Things that need the client's attention, computed from real state only.
	const actionsRequired: { key: string; title: string; body: string; link: string }[] = [];
	if (scope?.status === 'CLARIFICATION_REQUIRED') {
		actionsRequired.push({ key: 'scope-clarify', title: 'Scope clarification needed', body: 'Eiretech asked a question about your scope.', link: '/portal/scope' });
	}
	if (scope?.status === 'READY_FOR_APPROVAL') {
		actionsRequired.push({ key: 'scope-approve', title: 'Approve your scope', body: 'Your scope is ready for your approval.', link: '/portal/scope' });
	}
	if (scope?.status === 'DRAFT') {
		actionsRequired.push({ key: 'scope-complete', title: 'Complete your scope', body: `${scope.completionPercentage}% complete.`, link: '/portal/scope' });
	}
	if (srs?.status === 'CLIENT_REVIEW') {
		actionsRequired.push({ key: 'srs-review', title: 'Review the requirements', body: 'A requirements version is waiting for your review.', link: `/portal/projects/${id}?tab=requirements` });
	}
	if (srs?.status === 'READY_FOR_APPROVAL') {
		actionsRequired.push({ key: 'srs-approve', title: 'Approve the requirements', body: 'All discussion points are resolved.', link: `/portal/projects/${id}?tab=requirements` });
	}
	for (const c of changeRequests.filter((c) => c.status === 'CLARIFICATION_REQUIRED')) {
		actionsRequired.push({ key: `cr-${c.id}`, title: `Clarify: ${c.title}`, body: 'Eiretech needs more information on this request.', link: `/portal/projects/${id}?tab=changes&cr=${c.id}` });
	}

	return {
		project,
		scope,
		srs,
		overallProgress: progress.overallProgress,
		nextMilestone: progress.nextMilestone,
		milestones,
		tasks,
		updates,
		changeRequests,
		files,
		actionsRequired,
	};
});
