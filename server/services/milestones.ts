import type { H3Event } from 'h3';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit';
import { notifyOrganizationClients } from './notifications';
import { MILESTONE_STATUSES } from '~~/shared/delivery';

export const milestoneSchema = z
	.object({
		milestoneId: z.string().optional(),
		title: z.string().trim().min(1, 'A milestone title is required').max(200),
		description: z.string().max(4000).optional().nullable(),
		status: z.enum(MILESTONE_STATUSES).default('NOT_STARTED'),
		progressPercentage: z.coerce.number().int().min(0, 'Progress must be 0-100').max(100, 'Progress must be 0-100').default(0),
		weight: z.coerce.number().int().min(1, 'Weight must be a positive number').max(1000),
		startDate: z.string().optional().nullable(),
		dueDate: z.string().optional().nullable(),
		clientVisible: z.boolean().default(true),
		blockedReason: z.string().max(1000).optional().nullable(),
	})
	.superRefine((v, ctx) => {
		if (v.status === 'BLOCKED' && !v.blockedReason?.trim()) {
			ctx.addIssue({ code: 'custom', path: ['blockedReason'], message: 'A blocked reason is required when a milestone is blocked' });
		}
		if (v.startDate && v.dueDate && new Date(v.dueDate) < new Date(v.startDate)) {
			ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date cannot be before the start date' });
		}
	});

export type MilestoneInput = z.infer<typeof milestoneSchema>;

/** Business rules that reshape the input regardless of what the form sent. */
function normalise(input: MilestoneInput) {
	let progress = input.progressPercentage;
	if (input.status === 'COMPLETED') progress = 100;
	if (input.status === 'NOT_STARTED' && progress > 0) progress = 0;
	// Optional keys left out of the payload are left untouched on edit
	// (undefined) - only an explicit null clears them.
	return {
		title: input.title,
		...(input.description !== undefined ? { description: input.description } : {}),
		status: input.status,
		progressPercentage: progress,
		weight: input.weight,
		...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
		clientVisible: input.clientVisible,
		blockedReason: input.status === 'BLOCKED' ? (input.blockedReason ?? '').trim() : null,
	};
}

export async function saveMilestone(event: H3Event, ownerId: string, projectId: string, input: MilestoneInput) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	const data = normalise(input);

	if (input.milestoneId) {
		const existing = await prisma.milestone.findFirst({ where: { id: input.milestoneId, projectId } });
		if (!existing) throw createError({ statusCode: 404, statusMessage: 'Milestone not found' });

		const milestone = await prisma.milestone.update({ where: { id: existing.id }, data });
		const completedNow = existing.status !== 'COMPLETED' && milestone.status === 'COMPLETED';

		await recordAudit(event, {
			actorUserId: ownerId,
			action: completedNow ? 'MILESTONE_COMPLETED' : 'MILESTONE_UPDATED',
			entityType: 'milestone',
			entityId: milestone.id,
			metadata: { projectId, title: milestone.title, status: milestone.status, progress: milestone.progressPercentage },
		});

		if (milestone.clientVisible) {
			await notifyOrganizationClients(project.organizationId, {
				type: completedNow ? 'MILESTONE_COMPLETED' : 'MILESTONE_UPDATED',
				title: completedNow ? `Milestone completed: ${milestone.title}` : `Milestone updated: ${milestone.title}`,
				body: completedNow ? undefined : `${milestone.progressPercentage}% · ${milestone.status.replaceAll('_', ' ').toLowerCase()}`,
				link: `/portal/projects/${projectId}?tab=milestones`,
			});
		}
		return milestone;
	}

	const count = await prisma.milestone.count({ where: { projectId } });
	const milestone = await prisma.milestone.create({
		data: { ...data, projectId, organizationId: project.organizationId, sortOrder: count },
	});

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'MILESTONE_CREATED',
		entityType: 'milestone',
		entityId: milestone.id,
		metadata: { projectId, title: milestone.title },
	});

	if (milestone.clientVisible) {
		await notifyOrganizationClients(project.organizationId, {
			type: 'MILESTONE_CREATED',
			title: `New milestone: ${milestone.title}`,
			link: `/portal/projects/${projectId}?tab=milestones`,
		});
	}
	return milestone;
}

export async function deleteMilestone(event: H3Event, ownerId: string, projectId: string, milestoneId: string) {
	const existing = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
	if (!existing) throw createError({ statusCode: 404, statusMessage: 'Milestone not found' });

	// Detach dependents rather than cascading deletes of their history.
	await prisma.projectTask.updateMany({ where: { milestoneId }, data: { milestoneId: null } });
	await prisma.projectUpdate.updateMany({ where: { milestoneId }, data: { milestoneId: null } });
	await prisma.changeRequest.updateMany({ where: { relatedMilestoneId: milestoneId }, data: { relatedMilestoneId: null } });
	await prisma.milestone.delete({ where: { id: milestoneId } });

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'MILESTONE_DELETED',
		entityType: 'milestone',
		entityId: milestoneId,
		metadata: { projectId, title: existing.title },
	});
}

/** Reorder by an ordered list of ids. Ids outside the project are ignored. */
export async function reorderMilestones(event: H3Event, ownerId: string, projectId: string, orderedIds: string[]) {
	const own = await prisma.milestone.findMany({ where: { projectId }, select: { id: true } });
	const allowed = new Set(own.map((m) => m.id));
	let i = 0;
	for (const id of orderedIds) {
		if (!allowed.has(id)) continue;
		await prisma.milestone.update({ where: { id }, data: { sortOrder: i++ } });
	}
	await recordAudit(event, { actorUserId: ownerId, action: 'MILESTONES_REORDERED', entityType: 'project', entityId: projectId });
}
