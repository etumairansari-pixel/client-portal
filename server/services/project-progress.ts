import { prisma } from '../utils/prisma';
import { weightedProgress, nextMilestone } from '~~/shared/delivery';

/**
 * Everything derived from milestones for a project header.
 * The same numbers are served to Owner and Client - see the rule documented
 * on `weightedProgress` in shared/delivery.ts.
 */
export async function projectProgress(projectId: string, organizationId: string) {
	const milestones = await prisma.milestone.findMany({
		where: { projectId, organizationId },
		orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
		select: {
			id: true,
			title: true,
			status: true,
			progressPercentage: true,
			weight: true,
			dueDate: true,
			clientVisible: true,
			sortOrder: true,
		},
	});

	const next = nextMilestone(milestones);
	return {
		overallProgress: weightedProgress(milestones),
		nextMilestone: next ? { id: next.id, title: next.title, dueDate: next.dueDate } : null,
		milestoneCounts: {
			total: milestones.length,
			completed: milestones.filter((m) => m.status === 'COMPLETED').length,
			active: milestones.filter((m) => m.status !== 'COMPLETED' && m.status !== 'NOT_STARTED').length,
			blocked: milestones.filter((m) => m.status === 'BLOCKED').length,
		},
	};
}

/** Fields safe to send to a client for a milestone. No internal notes exist on the model. */
export const CLIENT_MILESTONE_SELECT = {
	id: true,
	title: true,
	description: true,
	status: true,
	progressPercentage: true,
	startDate: true,
	dueDate: true,
	blockedReason: true,
	sortOrder: true,
	updatedAt: true,
} as const;

/** Client task projection. Deliberately no assignee/employee fields - none exist, and none may be added here. */
export const CLIENT_TASK_SELECT = {
	id: true,
	milestoneId: true,
	title: true,
	status: true,
	progressPercentage: true,
	functionalTeam: true,
	dueDate: true,
	blockedReason: true,
	sortOrder: true,
	updatedAt: true,
} as const;
