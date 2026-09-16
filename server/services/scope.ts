import type { H3Event } from 'h3';
import type { Scope, ScopeStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { recordAudit } from './audit';
import { notify, notifyOwners } from './notifications';
import { calculateCompletion, missingRequired, type ScopeAnswers } from '~~/shared/scope-questionnaire';

/** Statuses in which the client may still edit the questionnaire itself. */
export const CLIENT_EDITABLE: ScopeStatus[] = ['DRAFT'];

/** Once approved, nothing may change it — not even the Owner. */
export function assertNotLocked(scope: Scope) {
	if (scope.status === 'APPROVED' || scope.lockedAt) {
		throw createError({ statusCode: 409, statusMessage: 'This scope is approved and locked' });
	}
}

/**
 * Loads a scope for a client, scoped by the session's organization.
 * A scope belonging to another tenant simply does not match, so it 404s.
 */
export async function getClientScope(organizationId: string, scopeId?: string) {
	return prisma.scope.findFirst({
		where: scopeId ? { id: scopeId, organizationId } : { organizationId },
		orderBy: { createdAt: 'desc' },
	});
}

export async function ensureClientScope(event: H3Event, organizationId: string, userId: string) {
	const existing = await getClientScope(organizationId);
	if (existing) return existing;

	const scope = await prisma.scope.create({
		data: { organizationId, createdById: userId, status: 'DRAFT', answers: {}, completionPercentage: 0 },
	});

	await recordAudit(event, {
		actorUserId: userId,
		action: 'SCOPE_CREATED',
		entityType: 'scope',
		entityId: scope.id,
		metadata: { organizationId },
	});

	return scope;
}

export async function saveDraft(
	event: H3Event,
	scope: Scope,
	userId: string,
	answers: ScopeAnswers,
	{ silent = false }: { silent?: boolean } = {},
) {
	if (!CLIENT_EDITABLE.includes(scope.status)) {
		throw createError({ statusCode: 409, statusMessage: 'This scope can no longer be edited' });
	}

	const completion = calculateCompletion(answers);
	const updated = await prisma.scope.update({
		where: { id: scope.id },
		data: { answers: answers as object, completionPercentage: completion, lastSavedAt: new Date() },
	});

	// Autosave fires constantly; only explicit saves are worth auditing.
	if (!silent) {
		await recordAudit(event, {
			actorUserId: userId,
			action: 'SCOPE_DRAFT_SAVED',
			entityType: 'scope',
			entityId: scope.id,
			metadata: { completion },
		});
	}

	return updated;
}

/**
 * Freezes the current answers into an immutable ScopeVersion, then moves the
 * scope out of the client's hands. The version is written first so a later
 * failure cannot lose a submission.
 */
export async function submitScope(event: H3Event, scope: Scope, userId: string) {
	if (!CLIENT_EDITABLE.includes(scope.status)) {
		throw createError({ statusCode: 409, statusMessage: 'This scope has already been submitted' });
	}

	const answers = (scope.answers ?? {}) as ScopeAnswers;
	const missing = missingRequired(answers);
	if (missing.length) {
		throw createError({
			statusCode: 400,
			statusMessage: `Please answer all required questions (${missing.length} remaining)`,
		});
	}

	const versionNumber = scope.currentVersion + 1;

	await prisma.scopeVersion.create({
		data: {
			scopeId: scope.id,
			organizationId: scope.organizationId,
			versionNumber,
			answers: answers as object,
			submittedById: userId,
			submittedAt: new Date(),
		},
	});

	const updated = await prisma.scope.update({
		where: { id: scope.id },
		data: { status: 'SUBMITTED', submittedAt: new Date(), currentVersion: versionNumber },
	});

	// Independent writes/reads after the state change run concurrently: each
	// database round-trip is paid once, not in sequence.
	const [, org] = await Promise.all([
		recordAudit(event, {
			actorUserId: userId,
			action: 'SCOPE_SUBMITTED',
			entityType: 'scope',
			entityId: scope.id,
			metadata: { versionNumber },
		}),
		prisma.organization.findUnique({ where: { id: scope.organizationId }, select: { name: true } }),
	]);
	await notifyOwners({
		type: 'SCOPE_SUBMITTED',
		title: 'Scope submitted',
		body: `${org?.name ?? 'A client'} submitted their project scope (v${versionNumber}).`,
		link: `/admin/scopes/${scope.id}`,
	});

	return updated;
}

/** Owner transitions. Each one is refused on an approved/locked scope. */
export async function setStatus(
	event: H3Event,
	scope: Scope,
	ownerId: string,
	status: ScopeStatus,
	audit: Parameters<typeof recordAudit>[1]['action'],
) {
	assertNotLocked(scope);

	const data: Record<string, unknown> = { status };
	if (status === 'UNDER_REVIEW' && !scope.reviewStartedAt) data.reviewStartedAt = new Date();
	if (status === 'READY_FOR_APPROVAL') data.readyForApprovalAt = new Date();

	const updated = await prisma.scope.update({ where: { id: scope.id }, data });

	await recordAudit(event, { actorUserId: ownerId, action: audit, entityType: 'scope', entityId: scope.id });
	return updated;
}

/** Client agreement, then the Owner's final confirmation locks it forever. */
export async function clientApprove(event: H3Event, scope: Scope, userId: string, statement?: string) {
	if (scope.status !== 'READY_FOR_APPROVAL') {
		throw createError({ statusCode: 409, statusMessage: 'This scope is not ready for approval yet' });
	}

	await prisma.scopeApproval.create({
		data: {
			scopeId: scope.id,
			organizationId: scope.organizationId,
			versionNumber: scope.currentVersion,
			clientApprovedById: userId,
			clientApprovedAt: new Date(),
			clientStatement: statement ?? null,
		},
	});

	const updated = await prisma.scope.update({
		where: { id: scope.id },
		data: { clientApprovedAt: new Date() },
	});

	await recordAudit(event, {
		actorUserId: userId,
		action: 'SCOPE_CLIENT_APPROVED',
		entityType: 'scope',
		entityId: scope.id,
		metadata: { versionNumber: scope.currentVersion },
	});

	const org = await prisma.organization.findUnique({ where: { id: scope.organizationId }, select: { name: true } });
	await notifyOwners({
		type: 'SCOPE_CLIENT_APPROVED',
		title: 'Client approved their scope',
		body: `${org?.name ?? 'A client'} agreed to scope v${scope.currentVersion}.`,
		link: `/admin/scopes/${scope.id}`,
	});

	return updated;
}

export async function ownerApprove(event: H3Event, scope: Scope, ownerId: string) {
	assertNotLocked(scope);
	if (!scope.clientApprovedAt) {
		throw createError({ statusCode: 409, statusMessage: 'The client has not approved this scope yet' });
	}

	const now = new Date();

	await prisma.scopeApproval.updateMany({
		where: { scopeId: scope.id, versionNumber: scope.currentVersion },
		data: { ownerApprovedById: ownerId, ownerApprovedAt: now },
	});

	const updated = await prisma.scope.update({
		where: { id: scope.id },
		data: { status: 'APPROVED', approvedAt: now, approvedById: ownerId, lockedAt: now },
	});

	await recordAudit(event, {
		actorUserId: ownerId,
		action: 'SCOPE_APPROVED',
		entityType: 'scope',
		entityId: scope.id,
		metadata: { versionNumber: scope.currentVersion },
	});

	const clients = await prisma.user.findMany({
		where: { organizationId: scope.organizationId, role: 'CLIENT', status: 'ACTIVE' },
		select: { id: true },
	});
	for (const c of clients) {
		await notify({
			userId: c.id,
			organizationId: scope.organizationId,
			type: 'SCOPE_APPROVED',
			title: 'Scope approved',
			body: 'Your project scope has been approved and locked. We are moving into planning.',
			link: '/portal/scope',
		});
	}

	return updated;
}
