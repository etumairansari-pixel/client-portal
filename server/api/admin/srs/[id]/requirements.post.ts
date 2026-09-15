import { z } from 'zod';
import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { assertOwnerEditable } from '~~/server/services/srs';
import { recordAudit } from '~~/server/services/audit';
import { nextRequirementRef } from '~~/shared/srs-template';

const schema = z.object({
	// Present when editing an existing requirement.
	requirementId: z.string().optional(),
	kind: z.enum(['FR', 'NFR']).optional(),
	title: z.string().min(1, 'A requirement title is required'),
	description: z.string().optional().nullable(),
	module: z.string().optional().nullable(),
	priority: z.enum(['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'WONT_HAVE']).optional(),
	state: z.enum(['DRAFT', 'CONFIRMED', 'REMOVED']).optional(),
	acceptanceCriteria: z.string().optional().nullable(),
	sortOrder: z.number().optional(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' });

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message ?? 'Invalid requirement' });
	}

	const doc = await prisma.srsDocument.findUnique({ where: { id } });
	if (!doc) throw createError({ statusCode: 404, statusMessage: 'Requirements document not found' });
	assertOwnerEditable(doc);

	const { requirementId, kind, ...fields } = body.data;

	// Editing keeps the existing ref: requirement IDs are stable for the life
	// of the document and are never renumbered.
	if (requirementId) {
		const existing = await prisma.srsRequirement.findFirst({ where: { id: requirementId, srsDocumentId: id } });
		if (!existing) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' });

		const requirement = await prisma.srsRequirement.update({
			where: { id: requirementId },
			data: { ...fields, ...(kind ? { kind } : {}) },
		});
		await recordAudit(event, {
			actorUserId: owner.id,
			action: 'SRS_REQUIREMENT_SAVED',
			entityType: 'srs_requirement',
			entityId: requirement.id,
			metadata: { ref: requirement.ref },
		});
		return { requirement };
	}

	const siblings = await prisma.srsRequirement.findMany({ where: { srsDocumentId: id }, select: { ref: true } });
	const ref = nextRequirementRef(kind ?? 'FR', siblings);

	const requirement = await prisma.srsRequirement.create({
		data: {
			srsDocumentId: id,
			organizationId: doc.organizationId,
			ref,
			kind: kind ?? 'FR',
			title: fields.title,
			description: fields.description ?? null,
			module: fields.module ?? null,
			priority: fields.priority ?? 'MUST_HAVE',
			state: fields.state ?? 'DRAFT',
			acceptanceCriteria: fields.acceptanceCriteria ?? null,
			sortOrder: fields.sortOrder ?? siblings.length,
		},
	});

	await recordAudit(event, {
		actorUserId: owner.id,
		action: 'SRS_REQUIREMENT_SAVED',
		entityType: 'srs_requirement',
		entityId: requirement.id,
		metadata: { ref },
	});

	return { requirement };
});
