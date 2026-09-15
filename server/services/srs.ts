import type { H3Event } from 'h3';
import type { SrsDocument } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit';
import { notify, notifyOwners, notifyOrganizationClients } from './notifications';
import { CLIENT_VISIBLE_SRS_STATUSES, nextVersionLabel } from '~~/shared/srs-template';

/** Owner may edit the working draft in these states only. */
export const OWNER_EDITABLE: SrsDocument['status'][] = ['DRAFT', 'INTERNAL_REVIEW', 'CHANGES_REQUESTED'];

export function assertNotLocked(doc: SrsDocument) {
	if (doc.status === 'APPROVED' || doc.lockedAt) {
		throw createError({ statusCode: 409, statusMessage: 'These requirements are approved and locked' });
	}
}

export function assertOwnerEditable(doc: SrsDocument) {
	assertNotLocked(doc);
	if (!OWNER_EDITABLE.includes(doc.status)) {
		throw createError({
			statusCode: 409,
			statusMessage: 'This version is with the client. Request changes back or create a new version first.',
		});
	}
}

/**
 * Loads an SRS for a client, scoped by session organization AND by whether the
 * document has actually been shared with them. A draft the Owner is still
 * writing is invisible to the client.
 */
export async function getClientSrs(organizationId: string, projectId?: string) {
	return prisma.srsDocument.findFirst({
		where: {
			organizationId,
			...(projectId ? { projectId } : {}),
			status: { in: CLIENT_VISIBLE_SRS_STATUSES as SrsDocument['status'][] },
		},
		orderBy: { createdAt: 'desc' },
	});
}

/** Creates the SRS against an APPROVED scope — never before. */
export async function createSrs(event: H3Event, ownerId: string, projectId: string) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	const existing = await prisma.srsDocument.findFirst({ where: { projectId } });
	if (existing) return existing;

	const scope = await prisma.scope.findFirst({
		where: { organizationId: project.organizationId, status: 'APPROVED' },
		orderBy: { approvedAt: 'desc' },
	});
	if (!scope) {
		throw createError({
			statusCode: 409,
			statusMessage: 'The client scope must be approved before requirements can be created',
		});
	}

	const doc = await prisma.srsDocument.create({
		data: {
			organizationId: project.organizationId,
			projectId,
			scopeId: scope.id,
			createdById: ownerId,
			status: 'DRAFT',
			content: {},
		},
	});

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'SRS_CREATED',
		entityType: 'srs_document',
		entityId: doc.id,
		metadata: { projectId, scopeId: scope.id },
	});

	return doc;
}

/**
 * Freezes the current draft into an immutable SrsVersion and shares it with the
 * client. A version already sent is never rewritten — the next send makes 1.1.
 */
export async function sendForReview(event: H3Event, doc: SrsDocument, ownerId: string) {
	assertNotLocked(doc);

	const requirements = await prisma.srsRequirement.findMany({
		where: { srsDocumentId: doc.id },
		orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { ref: 'asc' }],
	});

	const versionNumber = doc.currentVersion + 1;
	const versionLabel = nextVersionLabel(doc.currentVersion);

	await prisma.srsVersion.create({
		data: {
			srsDocumentId: doc.id,
			organizationId: doc.organizationId,
			versionNumber,
			versionLabel,
			title: doc.title,
			content: (doc.content ?? {}) as object,
			requirements: requirements as unknown as object,
			createdById: ownerId,
			sentAt: new Date(),
		},
	});

	const updated = await prisma.srsDocument.update({
		where: { id: doc.id },
		data: { status: 'CLIENT_REVIEW', currentVersion: versionNumber, submittedForReviewAt: new Date() },
	});

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'SRS_SENT_FOR_REVIEW',
		entityType: 'srs_document',
		entityId: doc.id,
		metadata: { versionLabel },
	});

	await notifyOrganizationClients(doc.organizationId, {
		type: 'SRS_SENT_FOR_REVIEW',
		title: `Requirements ${versionLabel} ready for your review`,
		body: 'Please review the requirements document and let us know if anything needs changing.',
		link: `/portal/projects/${doc.projectId}?tab=requirements`,
	});

	return updated;
}

export async function markReadyForApproval(event: H3Event, doc: SrsDocument, ownerId: string) {
	assertNotLocked(doc);
	if (doc.currentVersion < 1) {
		throw createError({ statusCode: 409, statusMessage: 'Send a version to the client before requesting approval' });
	}
	if (doc.status === 'CHANGES_REQUESTED') {
		throw createError({ statusCode: 409, statusMessage: 'The client requested changes. Send a new version first.' });
	}

	const open = await prisma.requirementDiscussion.count({ where: { srsDocumentId: doc.id, status: 'OPEN' } });
	if (open) {
		throw createError({ statusCode: 409, statusMessage: 'Resolve the open discussion points before requesting approval' });
	}

	const updated = await prisma.srsDocument.update({
		where: { id: doc.id },
		data: { status: 'READY_FOR_APPROVAL', readyForApprovalAt: new Date() },
	});

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'SRS_READY_FOR_APPROVAL',
		entityType: 'srs_document',
		entityId: doc.id,
	});

	await notifyOrganizationClients(doc.organizationId, {
		type: 'SRS_READY_FOR_APPROVAL',
		title: 'Requirements ready for approval',
		body: 'Please review and approve the requirements so we can begin planning.',
		link: `/portal/projects/${doc.projectId}?tab=requirements`,
	});

	return updated;
}

/** Client asks for changes. Ownership of editing returns to the Owner. */
export async function requestChanges(
	event: H3Event,
	doc: SrsDocument,
	userId: string,
	input: { subject: string; body: string; sectionKey?: string | null; requirementRef?: string | null },
) {
	assertNotLocked(doc);

	const discussion = await prisma.requirementDiscussion.create({
		data: {
			srsDocumentId: doc.id,
			organizationId: doc.organizationId,
			subject: input.subject.trim(),
			sectionKey: input.sectionKey ?? null,
			requirementRef: input.requirementRef ?? null,
			openedSide: 'CLIENT',
			openedById: userId,
		},
	});

	await prisma.requirementMessage.create({
		data: {
			discussionId: discussion.id,
			organizationId: doc.organizationId,
			authorSide: 'CLIENT',
			authorUserId: userId,
			body: input.body.trim(),
		},
	});

	const updated = await prisma.srsDocument.update({
		where: { id: doc.id },
		data: { status: 'CHANGES_REQUESTED' },
	});

	await recordAudit(event, {
		actorUserId: userId,
		action: 'SRS_CHANGE_REQUESTED',
		entityType: 'srs_document',
		entityId: doc.id,
		metadata: { subject: discussion.subject, requirementRef: input.requirementRef ?? null },
	});

	const org = await prisma.organization.findUnique({ where: { id: doc.organizationId }, select: { name: true } });
	await notifyOwners({
		type: 'SRS_CHANGE_REQUESTED',
		title: 'Client requested requirement changes',
		body: `${org?.name ?? 'A client'}: ${discussion.subject}`,
		link: `/admin/projects/${doc.projectId}?tab=requirements`,
	});

	return { document: updated, discussion };
}

/**
 * Client approval locks the requirements immediately. Unlike Scope this is a
 * single-sided approval: the Owner already authored and released the version,
 * so the client's acceptance is the final act.
 */
export async function clientApproveSrs(event: H3Event, doc: SrsDocument, userId: string, statement?: string) {
	if (doc.status !== 'READY_FOR_APPROVAL') {
		throw createError({ statusCode: 409, statusMessage: 'These requirements are not ready for approval yet' });
	}

	const open = await prisma.requirementDiscussion.count({ where: { srsDocumentId: doc.id, status: 'OPEN' } });
	if (open) {
		throw createError({ statusCode: 409, statusMessage: 'Please resolve the open discussion points first' });
	}

	const now = new Date();
	const versionLabel = nextVersionLabel(doc.currentVersion - 1);

	await prisma.requirementApproval.create({
		data: {
			srsDocumentId: doc.id,
			organizationId: doc.organizationId,
			versionLabel,
			clientApprovedById: userId,
			clientApprovedAt: now,
			clientStatement: statement ?? null,
		},
	});

	const updated = await prisma.srsDocument.update({
		where: { id: doc.id },
		data: { status: 'APPROVED', clientApprovedAt: now, approvedAt: now, lockedAt: now },
	});

	await recordAudit(event, {
		actorUserId: userId,
		action: 'SRS_APPROVED',
		entityType: 'srs_document',
		entityId: doc.id,
		metadata: { versionLabel },
	});

	await notifyOwners({
		type: 'SRS_APPROVED',
		title: 'Client approved the requirements',
		body: `Requirements ${versionLabel} approved and locked.`,
		link: `/admin/projects/${doc.projectId}?tab=requirements`,
	});

	await evaluateProjectReadiness(event, doc.projectId, userId);
	return updated;
}

/**
 * A project becomes READY FOR DELIVERY only when BOTH the Scope and the
 * Requirements are approved.
 *
 * Design choice: we set `readyForDeliveryAt` and move `currentStage` to
 * PLANNING — deliberately NOT to DEVELOPMENT, because nothing has been built
 * yet. Planning is the honest next stage.
 */
export async function evaluateProjectReadiness(event: H3Event, projectId: string, actorId: string) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project || project.readyForDeliveryAt) return project;

	const [scopeApproved, srsApproved] = await Promise.all([
		prisma.scope.count({ where: { organizationId: project.organizationId, status: 'APPROVED' } }),
		prisma.srsDocument.count({ where: { projectId, status: 'APPROVED' } }),
	]);

	if (!scopeApproved || !srsApproved) return project;

	const updated = await prisma.project.update({
		where: { id: projectId },
		data: { readyForDeliveryAt: new Date(), currentStage: 'PLANNING' },
	});

	await recordAudit(event, {
		actorUserId: actorId,
		action: 'PROJECT_READY_FOR_DELIVERY',
		entityType: 'project',
		entityId: projectId,
		metadata: { stage: 'PLANNING' },
	});

	await notifyOrganizationClients(project.organizationId, {
		type: 'PROJECT_READY_FOR_DELIVERY',
		title: 'Project approved',
		body: 'Scope and requirements are both approved. We are moving into planning.',
		link: `/portal/projects/${projectId}`,
	});

	return updated;
}

export async function postMessage(
	event: H3Event,
	discussionId: string,
	organizationId: string,
	side: 'EIRETECH' | 'CLIENT',
	userId: string,
	body: string,
) {
	const discussion = await prisma.requirementDiscussion.findFirst({
		where: { id: discussionId, organizationId },
		include: { srsDocument: true },
	});
	if (!discussion) throw createError({ statusCode: 404, statusMessage: 'Discussion not found' });
	assertNotLocked(discussion.srsDocument);

	await prisma.requirementMessage.create({
		data: { discussionId, organizationId, authorSide: side, authorUserId: userId, body: body.trim() },
	});

	await recordAudit(event, {
		actorUserId: userId,
		action: 'SRS_MESSAGE_POSTED',
		entityType: 'requirement_discussion',
		entityId: discussionId,
	});

	if (side === 'EIRETECH') {
		await notifyOrganizationClients(organizationId, {
			type: 'SRS_MESSAGE',
			title: 'New message about your requirements',
			body: discussion.subject,
			link: `/portal/projects/${discussion.srsDocument.projectId}?tab=requirements`,
		});
	} else {
		await notifyOwners({
			type: 'SRS_MESSAGE',
			title: 'Client replied on requirements',
			body: discussion.subject,
			link: `/admin/projects/${discussion.srsDocument.projectId}?tab=requirements`,
		});
	}

	return discussion;
}

export { notify };
