import type { H3Event } from 'h3';
import { z } from 'zod';
import type { AuditAction } from './audit';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit';
import { notifyOwners, notifyOrganizationClients } from './notifications';
import { CHANGE_REQUEST_TYPES, PRIORITIES, CR_TRANSITIONS, CR_STATUS_LABEL } from '~~/shared/delivery';

/**
 * Change requests. The client submits, replies and reads; the Owner alone
 * moves status, and only along CR_TRANSITIONS. Employee identity is never
 * part of a client payload - see CLIENT_CR_SELECT.
 */

/** What a client may set when raising a request. Nothing else is read from the body. */
export const clientCreateSchema = z.object({
	type: z.enum(CHANGE_REQUEST_TYPES),
	title: z.string().trim().min(1, 'A title is required').max(200),
	description: z.string().trim().min(1, 'Please describe the request').max(8000),
	priority: z.enum(PRIORITIES).default('MEDIUM'),
	relatedMilestoneId: z.string().optional().nullable(),
});

export const CLIENT_MESSAGE_SELECT = { id: true, authorSide: true, body: true, createdAt: true } as const;
export const CLIENT_ATTACHMENT_SELECT = { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } as const;

/** Client projection - no createdById, no authorUserId, no uploadedById. */
export const CLIENT_CR_SELECT = {
	id: true,
	projectId: true,
	type: true,
	title: true,
	description: true,
	priority: true,
	status: true,
	relatedMilestoneId: true,
	relatedMilestone: { select: { id: true, title: true } },
	resolutionNote: true,
	resolvedAt: true,
	createdAt: true,
	updatedAt: true,
	createdBySide: true,
	messages: { orderBy: { createdAt: 'asc' as const }, select: CLIENT_MESSAGE_SELECT },
	attachments: { orderBy: { createdAt: 'asc' as const }, select: CLIENT_ATTACHMENT_SELECT },
} as const;

export async function createChangeRequest(
	event: H3Event,
	user: { id: string; organizationId: string },
	projectId: string,
	input: z.infer<typeof clientCreateSchema>,
) {
	// Project must belong to the caller's organization. Anything else is 404.
	const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId } });
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	if (input.relatedMilestoneId) {
		const m = await prisma.milestone.findFirst({
			where: { id: input.relatedMilestoneId, projectId, organizationId: user.organizationId, clientVisible: true },
			select: { id: true },
		});
		if (!m) throw createError({ statusCode: 400, statusMessage: 'Unknown milestone' });
	}

	const cr = await prisma.changeRequest.create({
		data: {
			organizationId: user.organizationId,
			projectId,
			createdById: user.id,
			createdBySide: 'CLIENT',
			type: input.type,
			title: input.title,
			description: input.description,
			priority: input.priority,
			relatedMilestoneId: input.relatedMilestoneId || null,
			status: 'SUBMITTED',
		},
	});

	await recordAudit(event, {
		actorUserId: user.id,
		action: 'CHANGE_REQUEST_CREATED',
		entityType: 'change_request',
		entityId: cr.id,
		metadata: { projectId, type: cr.type, title: cr.title },
	});

	const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
	await notifyOwners({
		type: 'CHANGE_REQUEST_SUBMITTED',
		title: `New ${cr.type.replaceAll('_', ' ').toLowerCase()} from ${org?.name ?? 'a client'}`,
		body: cr.title,
		link: `/admin/projects/${projectId}?tab=changes&cr=${cr.id}`,
	});

	return cr;
}

const TRANSITION_AUDIT: Record<string, AuditAction> = {
	UNDER_REVIEW: 'CHANGE_REQUEST_REVIEW_STARTED',
	CLARIFICATION_REQUIRED: 'CHANGE_REQUEST_CLARIFICATION_REQUESTED',
	ACCEPTED: 'CHANGE_REQUEST_ACCEPTED',
	DECLINED: 'CHANGE_REQUEST_DECLINED',
	IN_PROGRESS: 'CHANGE_REQUEST_STARTED',
	COMPLETED: 'CHANGE_REQUEST_COMPLETED',
};

const TRANSITION_NOTICE: Record<string, string> = {
	UNDER_REVIEW: 'Your request is now under review.',
	CLARIFICATION_REQUIRED: 'We need a little more information on your request.',
	ACCEPTED: 'Your request has been accepted.',
	DECLINED: 'Your request could not be accepted.',
	IN_PROGRESS: 'Work on your request has started.',
	COMPLETED: 'Your request is complete.',
};

/** Owner-only. Refuses any move not listed in CR_TRANSITIONS. */
export async function transitionChangeRequest(
	event: H3Event,
	ownerId: string,
	changeRequestId: string,
	to: string,
	note?: string | null,
) {
	const cr = await prisma.changeRequest.findUnique({ where: { id: changeRequestId } });
	if (!cr) throw createError({ statusCode: 404, statusMessage: 'Change request not found' });

	const allowed = CR_TRANSITIONS[cr.status] ?? [];
	if (!allowed.includes(to)) {
		throw createError({
			statusCode: 409,
			statusMessage: `Cannot move a ${CR_STATUS_LABEL[cr.status] ?? cr.status} request to ${CR_STATUS_LABEL[to] ?? to}`,
		});
	}

	// Clarification is a question to the client, so it must carry a message.
	if (to === 'CLARIFICATION_REQUIRED' && !note?.trim()) {
		throw createError({ statusCode: 400, statusMessage: 'Tell the client what you need clarified' });
	}
	if (to === 'DECLINED' && !note?.trim()) {
		throw createError({ statusCode: 400, statusMessage: 'Give the client a reason for declining' });
	}

	const terminal = to === 'DECLINED' || to === 'COMPLETED';
	const updated = await prisma.changeRequest.update({
		where: { id: cr.id },
		data: {
			status: to as typeof cr.status,
			...(terminal ? { resolvedAt: new Date(), resolutionNote: note?.trim() || null } : {}),
		},
	});

	if (note?.trim() && (to === 'CLARIFICATION_REQUIRED' || to === 'DECLINED' || to === 'COMPLETED' || to === 'ACCEPTED')) {
		await prisma.changeRequestMessage.create({
			data: { changeRequestId: cr.id, organizationId: cr.organizationId, authorSide: 'EIRETECH', authorUserId: ownerId, body: note.trim() },
		});
	}

	await recordAudit(event, {
		actorUserId: ownerId,
		action: TRANSITION_AUDIT[to],
		entityType: 'change_request',
		entityId: cr.id,
		metadata: { projectId: cr.projectId, from: cr.status, to },
	});

	await notifyOrganizationClients(cr.organizationId, {
		type: `CHANGE_REQUEST_${to}`,
		title: `${cr.title}: ${CR_STATUS_LABEL[to]}`,
		body: TRANSITION_NOTICE[to],
		link: `/portal/projects/${cr.projectId}?tab=changes&cr=${cr.id}`,
	});

	return updated;
}

export async function replyToChangeRequest(
	event: H3Event,
	changeRequestId: string,
	organizationId: string | null,
	side: 'EIRETECH' | 'CLIENT',
	userId: string,
	body: string,
) {
	// Owner passes null organizationId (may reply anywhere); a client is pinned to their own org.
	const cr = await prisma.changeRequest.findFirst({
		where: organizationId ? { id: changeRequestId, organizationId } : { id: changeRequestId },
	});
	if (!cr) throw createError({ statusCode: 404, statusMessage: 'Change request not found' });
	if (cr.status === 'DECLINED' || cr.status === 'COMPLETED') {
		throw createError({ statusCode: 409, statusMessage: 'This request is closed' });
	}

	await prisma.changeRequestMessage.create({
		data: { changeRequestId: cr.id, organizationId: cr.organizationId, authorSide: side, authorUserId: userId, body: body.trim() },
	});

	// A client answering a clarification hands the request back for review.
	let status = cr.status;
	if (side === 'CLIENT' && cr.status === 'CLARIFICATION_REQUIRED') {
		status = 'UNDER_REVIEW';
		await prisma.changeRequest.update({ where: { id: cr.id }, data: { status } });
	}

	await recordAudit(event, {
		actorUserId: userId,
		action: 'CHANGE_REQUEST_REPLIED',
		entityType: 'change_request',
		entityId: cr.id,
		metadata: { projectId: cr.projectId, side },
	});

	if (side === 'EIRETECH') {
		await notifyOrganizationClients(cr.organizationId, {
			type: 'CHANGE_REQUEST_MESSAGE',
			title: `Reply on: ${cr.title}`,
			body: body.trim().slice(0, 140),
			link: `/portal/projects/${cr.projectId}?tab=changes&cr=${cr.id}`,
		});
	} else {
		await notifyOwners({
			type: 'CHANGE_REQUEST_MESSAGE',
			title: `Client replied on: ${cr.title}`,
			body: body.trim().slice(0, 140),
			link: `/admin/projects/${cr.projectId}?tab=changes&cr=${cr.id}`,
		});
	}

	return { ...cr, status };
}
