import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';
import { notifyOrganizationClients } from '~~/server/services/notifications';
import { PROJECT_STAGES, PROJECT_STATUSES, PROJECT_HEALTHS, STAGE_LABEL, HEALTH_LABEL } from '~~/shared/delivery';

const schema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional().nullable(),
	status: z.enum(PROJECT_STATUSES).optional(),
	// Stage and health are Owner decisions - never derived from progress.
	currentStage: z.enum(PROJECT_STAGES).optional(),
	health: z.enum(PROJECT_HEALTHS).optional(),
	healthReason: z.string().max(1000).optional().nullable(),
	startDate: z.string().optional().nullable(),
	targetDate: z.string().optional().nullable(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing project id' });

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid project details' });

	const before = await prisma.project.findUnique({ where: { id } });
	if (!before) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

	const { startDate, targetDate, ...rest } = body.data;
	const project = await prisma.project.update({
		where: { id },
		data: {
			...rest,
			...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
			...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
		},
	});

	const stageChanged = rest.currentStage && rest.currentStage !== before.currentStage;
	const healthChanged = rest.health && rest.health !== before.health;

	if (stageChanged) {
		await recordAudit(event, {
			actorUserId: owner.id,
			action: 'PROJECT_STAGE_CHANGED',
			entityType: 'project',
			entityId: id,
			metadata: { from: before.currentStage, to: project.currentStage },
		});
		await notifyOrganizationClients(project.organizationId, {
			type: 'PROJECT_STAGE_CHANGED',
			title: `${project.name} moved to ${STAGE_LABEL[project.currentStage]}`,
			link: `/portal/projects/${id}`,
		});
	}
	if (healthChanged) {
		await recordAudit(event, {
			actorUserId: owner.id,
			action: 'PROJECT_HEALTH_CHANGED',
			entityType: 'project',
			entityId: id,
			metadata: { from: before.health, to: project.health },
		});
		await notifyOrganizationClients(project.organizationId, {
			type: 'PROJECT_HEALTH_CHANGED',
			title: `${project.name} is now ${HEALTH_LABEL[project.health]}`,
			body: project.health === 'BLOCKED' ? (project.healthReason ?? undefined) : undefined,
			link: `/portal/projects/${id}`,
		});
	}
	if (!stageChanged && !healthChanged) {
		await recordAudit(event, { actorUserId: owner.id, action: 'PROJECT_UPDATED', entityType: 'project', entityId: id });
	}

	return { project };
});
