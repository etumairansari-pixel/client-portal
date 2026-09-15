/**
 * Shared labels and rules for the Phase 5 delivery workspace.
 * Used by both server services and Vue pages so labels never drift.
 */

export const PROJECT_STAGES = ['PLANNING', 'DESIGN', 'DEVELOPMENT', 'QA', 'CLIENT_REVIEW', 'DEPLOYMENT', 'COMPLETED', 'ON_HOLD'] as const;
export const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
export const PROJECT_HEALTHS = ['ON_TRACK', 'AT_RISK', 'BLOCKED'] as const;
export const MILESTONE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'BLOCKED', 'COMPLETED'] as const;
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'UNDER_REVIEW', 'BLOCKED', 'COMPLETED'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const FUNCTIONAL_TEAMS = ['PROJECT_MANAGEMENT', 'DEVELOPMENT', 'DESIGN', 'QA', 'SUPPORT'] as const;
export const CHANGE_REQUEST_TYPES = ['CHANGE_REQUEST', 'NEW_FEATURE', 'BUG', 'CONTENT_UPDATE', 'SUPPORT'] as const;
export const CHANGE_REQUEST_STATUSES = [
	'SUBMITTED',
	'UNDER_REVIEW',
	'CLARIFICATION_REQUIRED',
	'ACCEPTED',
	'DECLINED',
	'IN_PROGRESS',
	'COMPLETED',
] as const;

export const STAGE_LABEL: Record<string, string> = {
	PLANNING: 'Planning',
	DESIGN: 'Design',
	DEVELOPMENT: 'Development',
	QA: 'QA',
	CLIENT_REVIEW: 'Client Review',
	DEPLOYMENT: 'Deployment',
	COMPLETED: 'Completed',
	ON_HOLD: 'On Hold',
};
export const HEALTH_LABEL: Record<string, string> = { ON_TRACK: 'On Track', AT_RISK: 'At Risk', BLOCKED: 'Blocked' };
export const MILESTONE_STATUS_LABEL: Record<string, string> = {
	NOT_STARTED: 'Not Started',
	IN_PROGRESS: 'In Progress',
	UNDER_REVIEW: 'Under Review',
	BLOCKED: 'Blocked',
	COMPLETED: 'Completed',
};
export const TASK_STATUS_LABEL: Record<string, string> = {
	TODO: 'To Do',
	IN_PROGRESS: 'In Progress',
	UNDER_REVIEW: 'Under Review',
	BLOCKED: 'Blocked',
	COMPLETED: 'Completed',
};
export const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
export const TEAM_LABEL: Record<string, string> = {
	PROJECT_MANAGEMENT: 'Project Management',
	DEVELOPMENT: 'Development Team',
	DESIGN: 'Design Team',
	QA: 'QA Team',
	SUPPORT: 'Support Team',
};
export const CR_TYPE_LABEL: Record<string, string> = {
	CHANGE_REQUEST: 'Change Request',
	NEW_FEATURE: 'New Feature',
	BUG: 'Bug',
	CONTENT_UPDATE: 'Content Update',
	SUPPORT: 'Support',
};
export const CR_STATUS_LABEL: Record<string, string> = {
	SUBMITTED: 'Submitted',
	UNDER_REVIEW: 'Under Review',
	CLARIFICATION_REQUIRED: 'Clarification Required',
	ACCEPTED: 'Accepted',
	DECLINED: 'Declined',
	IN_PROGRESS: 'In Progress',
	COMPLETED: 'Completed',
};

/**
 * Change request lifecycle. Owner-only. Anything not listed here is refused
 * server-side, so status can never jump arbitrarily.
 */
export const CR_TRANSITIONS: Record<string, readonly string[]> = {
	SUBMITTED: ['UNDER_REVIEW'],
	UNDER_REVIEW: ['CLARIFICATION_REQUIRED', 'ACCEPTED', 'DECLINED'],
	CLARIFICATION_REQUIRED: ['UNDER_REVIEW'],
	ACCEPTED: ['IN_PROGRESS'],
	IN_PROGRESS: ['COMPLETED'],
	DECLINED: [],
	COMPLETED: [],
};

/**
 * Weighted overall progress.
 *
 * RULE (documented, single source of truth): EVERY milestone of the project
 * contributes to overall progress, including milestones that are not client
 * visible. Owner and Client therefore always see the SAME percentage - the
 * client simply does not see the internal milestone's row. Milestones with a
 * non-positive weight are ignored. With no contributing milestones the result
 * is `null`, rendered as "Not available yet" - never a fake 0%.
 */
export function weightedProgress(milestones: { progressPercentage: number; weight: number }[]): number | null {
	const usable = milestones.filter((m) => Number.isFinite(m.weight) && m.weight > 0);
	if (!usable.length) return null;
	const total = usable.reduce((s, m) => s + m.weight, 0);
	const sum = usable.reduce((s, m) => s + Math.min(100, Math.max(0, m.progressPercentage)) * m.weight, 0);
	return Math.round(sum / total);
}

/** Nearest incomplete client-visible milestone by due date, then sort order. */
export function nextMilestone<T extends { status: string; clientVisible: boolean; dueDate?: Date | string | null; sortOrder: number }>(
	milestones: T[],
): T | null {
	const open = milestones.filter((m) => m.clientVisible && m.status !== 'COMPLETED');
	open.sort((a, b) => {
		const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
		const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
		return ad - bd || a.sortOrder - b.sortOrder;
	});
	return open[0] ?? null;
}
