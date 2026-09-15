import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { recordAudit } from '~~/server/services/audit';

const STAGES = ['PLANNING','DESIGN','DEVELOPMENT','QA','CLIENT_REVIEW','DEPLOYMENT','COMPLETED','ON_HOLD'] as const;

const schema = z.object({
	organizationId: z.string().min(1, 'Select a client'),
	name: z.string().min(1, 'Project name is required'),
	description: z.string().optional().nullable(),
	currentStage: z.enum(STAGES).optional(),
	startDate: z.string().optional().nullable(),
	targetDate: z.string().optional().nullable(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid project' });
	}

	const organization = await prisma.organization.findUnique({ where: { id: body.data.organizationId } });
	if (!organization) throw createError({ statusCode: 404, statusMessage: 'Client not found' });

	const project = await prisma.project.create({
		data: {
			organizationId: body.data.organizationId,
			name: body.data.name.trim(),
			description: body.data.description?.trim() || null,
			currentStage: body.data.currentStage ?? 'PLANNING',
			startDate: body.data.startDate ? new Date(body.data.startDate) : null,
			targetDate: body.data.targetDate ? new Date(body.data.targetDate) : null,
		},
	});

	await recordAudit(event, {
		actorUserId: owner.id,
		action: 'PROJECT_CREATED',
		entityType: 'project',
		entityId: project.id,
		metadata: { name: project.name, organizationId: project.organizationId },
	});

	return { project };
});
