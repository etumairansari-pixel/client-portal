import type { H3Event } from 'h3';
import { prisma } from '../utils/prisma';
import { generateTemporaryPassword, hashPassword, revokeAllSessions } from '../utils/auth';
import { recordAudit } from './audit';
import { sendClientWelcomeEmail } from './mail';

export interface CreateClientInput {
	organizationName: string;
	firstName: string;
	lastName: string;
	email: string;
	phone?: string | null;
	website?: string | null;
}

/**
 * Creates the Organization + CLIENT user in one step and returns a temporary
 * password ONCE. Only the hash is persisted — the plaintext is never stored,
 * logged, or recoverable afterwards.
 *
 * MongoDB has no cross-document transactions here, so on failure to create the
 * user we roll the organization back by hand.
 */
export async function createClient(event: H3Event, actorId: string, input: CreateClientInput) {
	const email = input.email.trim().toLowerCase();

	if (await prisma.user.findUnique({ where: { email } })) {
		throw createError({ statusCode: 409, statusMessage: 'A user with that email already exists' });
	}

	const organization = await prisma.organization.create({
		data: {
			name: input.organizationName.trim(),
			email,
			phone: input.phone?.trim() || null,
			website: input.website?.trim() || null,
			status: 'ACTIVE',
		},
	});

	const temporaryPassword = generateTemporaryPassword();

	let user;
	try {
		user = await prisma.user.create({
			data: {
				email,
				passwordHash: await hashPassword(temporaryPassword),
				firstName: input.firstName.trim(),
				lastName: input.lastName.trim(),
				role: 'CLIENT',
				status: 'ACTIVE',
				organizationId: organization.id,
				mustChangePassword: true,
			},
		});
	} catch (error) {
		await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
		throw error;
	}

	await sendClientWelcomeEmail(email, temporaryPassword);
	await recordAudit(event, {
		actorUserId: actorId,
		action: 'CLIENT_CREATED',
		entityType: 'organization',
		entityId: organization.id,
		metadata: { organizationName: organization.name, userEmail: email },
	});

	return { organization, user, temporaryPassword };
}

/** Issues a fresh temporary password and kills every existing session. */
export async function resetClientAccess(event: H3Event, actorId: string, userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.role !== 'CLIENT') {
		throw createError({ statusCode: 404, statusMessage: 'Client not found' });
	}

	const temporaryPassword = generateTemporaryPassword();
	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
	});
	await revokeAllSessions(userId);

	await recordAudit(event, {
		actorUserId: actorId,
		action: 'CLIENT_ACCESS_RESET',
		entityType: 'user',
		entityId: userId,
		metadata: { userEmail: user.email },
	});

	return { temporaryPassword };
}

export async function setClientStatus(
	event: H3Event,
	actorId: string,
	organizationId: string,
	status: 'ACTIVE' | 'SUSPENDED',
) {
	const organization = await prisma.organization.update({ where: { id: organizationId }, data: { status } });

	// Suspending a company must lock its people out immediately.
	await prisma.user.updateMany({
		where: { organizationId },
		data: { status: status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' },
	});

	if (status === 'SUSPENDED') {
		const users = await prisma.user.findMany({ where: { organizationId }, select: { id: true } });
		for (const u of users) await revokeAllSessions(u.id);
	}

	await recordAudit(event, {
		actorUserId: actorId,
		action: status === 'ACTIVE' ? 'CLIENT_ACTIVATED' : 'CLIENT_SUSPENDED',
		entityType: 'organization',
		entityId: organizationId,
		metadata: { organizationName: organization.name },
	});

	return organization;
}
