import type { H3Event } from 'h3';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit';
import { notifyOrganizationClients } from './notifications';

export const updateSchema = z.object({
	title: z.string().trim().min(1, 'An update title is required').max(200),
	message: z.string().trim().min(1, 'Please write the update').max(8000),
	milestoneId: z.string().optional().nullable(),
	clientVisible: z.boolean().default(true),
});

export type UpdateInput = z.infer<typeof updateSchema>;

/** Client projection: the poster is never included. */
export const CLIENT_UPDATE_SELECT = {
	id: true,
	title: true,
	message: true,
	milestoneId: true,
	createdAt: true,
	milestone: { select: { id: true, title: true } },
} as const;

export async function postUpdate(event: H3Event, ownerId: string, projectId: string, input: UpdateInput) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	if (input.milestoneId) {
		const m = await prisma.milestone.findFirst({ where: { id: input.milestoneId, projectId }, select: { id: true } });
		if (!m) throw createError({ statusCode: 400, statusMessage: 'Milestone does not belong to this project' });
	}

	const update = await prisma.projectUpdate.create({
		data: {
			projectId,
			organizationId: project.organizationId,
			milestoneId: input.milestoneId || null,
			title: input.title,
			message: input.message,
			clientVisible: input.clientVisible,
			postedById: ownerId,
		},
	});

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'PROJECT_UPDATE_POSTED',
		entityType: 'project_update',
		entityId: update.id,
		metadata: { projectId, title: update.title, clientVisible: update.clientVisible },
	});

	if (update.clientVisible) {
		await notifyOrganizationClients(project.organizationId, {
			type: 'PROJECT_UPDATE_POSTED',
			title: `Project update: ${update.title}`,
			body: update.message.slice(0, 140),
			link: `/portal/projects/${projectId}?tab=updates`,
		});
	}
	return update;
}
