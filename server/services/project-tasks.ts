import type { H3Event } from 'h3';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit';
import { TASK_STATUSES, PRIORITIES, FUNCTIONAL_TEAMS } from '~~/shared/delivery';

/**
 * Tasks are work items, NOT staff assignments. There is deliberately no
 * assignee field; the functional team is the only "who" a client ever sees.
 */
export const taskSchema = z
	.object({
		taskId: z.string().optional(),
		milestoneId: z.string().optional().nullable(),
		title: z.string().trim().min(1, 'A task title is required').max(200),
		description: z.string().max(4000).optional().nullable(),
		status: z.enum(TASK_STATUSES).default('TODO'),
		progressPercentage: z.coerce.number().int().min(0, 'Progress must be 0-100').max(100, 'Progress must be 0-100').default(0),
		priority: z.enum(PRIORITIES).default('MEDIUM'),
		functionalTeam: z.enum(FUNCTIONAL_TEAMS).default('DEVELOPMENT'),
		clientVisible: z.boolean().default(false),
		startDate: z.string().optional().nullable(),
		dueDate: z.string().optional().nullable(),
		blockedReason: z.string().max(1000).optional().nullable(),
	})
	.superRefine((v, ctx) => {
		if (v.status === 'BLOCKED' && !v.blockedReason?.trim()) {
			ctx.addIssue({ code: 'custom', path: ['blockedReason'], message: 'A blocked reason is required when a task is blocked' });
		}
	});

export type TaskInput = z.infer<typeof taskSchema>;

export async function saveTask(event: H3Event, ownerId: string, projectId: string, input: TaskInput) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	// A milestone from another project cannot be attached.
	if (input.milestoneId) {
		const m = await prisma.milestone.findFirst({ where: { id: input.milestoneId, projectId }, select: { id: true } });
		if (!m) throw createError({ statusCode: 400, statusMessage: 'Milestone does not belong to this project' });
	}

	let progress = input.progressPercentage;
	if (input.status === 'COMPLETED') progress = 100;
	if (input.status === 'TODO' && progress > 0) progress = 0;

	// Optional keys left out of the payload are left untouched on edit.
	const data = {
		...(input.milestoneId !== undefined ? { milestoneId: input.milestoneId || null } : {}),
		title: input.title,
		...(input.description !== undefined ? { description: input.description } : {}),
		status: input.status,
		progressPercentage: progress,
		priority: input.priority,
		functionalTeam: input.functionalTeam,
		clientVisible: input.clientVisible,
		...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
		blockedReason: input.status === 'BLOCKED' ? (input.blockedReason ?? '').trim() : null,
	};

	if (input.taskId) {
		const existing = await prisma.projectTask.findFirst({ where: { id: input.taskId, projectId } });
		if (!existing) throw createError({ statusCode: 404, statusMessage: 'Task not found' });
		const task = await prisma.projectTask.update({ where: { id: existing.id }, data });
		const completedNow = existing.status !== 'COMPLETED' && task.status === 'COMPLETED';
		await recordAudit(event, {
			actorUserId: ownerId,
			action: completedNow ? 'PROJECT_TASK_COMPLETED' : 'PROJECT_TASK_UPDATED',
			entityType: 'project_task',
			entityId: task.id,
			metadata: { projectId, title: task.title, status: task.status, progress: task.progressPercentage, clientVisible: task.clientVisible },
		});
		return task;
	}

	const count = await prisma.projectTask.count({ where: { projectId } });
	const task = await prisma.projectTask.create({
		data: { ...data, projectId, organizationId: project.organizationId, sortOrder: count },
	});
	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'PROJECT_TASK_CREATED',
		entityType: 'project_task',
		entityId: task.id,
		metadata: { projectId, title: task.title, clientVisible: task.clientVisible },
	});
	return task;
}

export async function deleteTask(event: H3Event, ownerId: string, projectId: string, taskId: string) {
	const existing = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
	if (!existing) throw createError({ statusCode: 404, statusMessage: 'Task not found' });
	await prisma.projectTask.delete({ where: { id: taskId } });
	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'PROJECT_TASK_DELETED',
		entityType: 'project_task',
		entityId: taskId,
		metadata: { projectId, title: existing.title },
	});
}

export async function reorderTasks(projectId: string, orderedIds: string[]) {
	const own = await prisma.projectTask.findMany({ where: { projectId }, select: { id: true } });
	const allowed = new Set(own.map((t) => t.id));
	let i = 0;
	for (const id of orderedIds) {
		if (!allowed.has(id)) continue;
		await prisma.projectTask.update({ where: { id }, data: { sortOrder: i++ } });
	}
}
