import type { H3Event } from 'h3';
import { prisma } from '../utils/prisma';
import {
	createInvitationToken,
	generateUnusablePassword,
	hashPassword,
	revokeAllSessions,
	INVITE_TTL_HOURS,
} from '../utils/auth';
import { getEnv } from '../utils/env';
import { recordAudit } from './audit';
import { invitationLink, sendClientInvitationEmail } from './mail';

export interface CreateClientInput {
	organizationName: string;
	firstName: string;
	lastName: string;
	email: string;
	phone?: string | null;
	website?: string | null;
}

export interface Invitation {
	/** True when a real mail transport accepted the message. */
	delivered: boolean;
	expiresAt: Date;
	/**
	 * Present only when mail is not configured, so the Owner can hand the
	 * activation link over by another channel. Never returned when the email
	 * was actually sent.
	 */
	setupLink?: string;
}

/**
 * Issues a fresh single-use activation link and emails it. No password ever
 * leaves the server: the account is unusable until the client redeems the
 * link and chooses their own.
 */
async function invite(
	user: { id: string; email: string; firstName: string | null },
	organizationName: string,
): Promise<Invitation> {
	const token = await createInvitationToken(user.id);
	const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
	const { delivered } = await sendClientInvitationEmail(user, token, organizationName, INVITE_TTL_HOURS);
	const invitation: Invitation = { delivered, expiresAt };
	if (!getEnv().mailEnabled) invitation.setupLink = invitationLink(token);
	return invitation;
}

/**
 * Creates the Organization + CLIENT user in one step and sends the client an
 * invitation to set their own password. The account is created with an
 * unusable random password, so nothing can sign in until the invitation is
 * redeemed.
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

	let user;
	try {
		user = await prisma.user.create({
			data: {
				email,
				passwordHash: await hashPassword(generateUnusablePassword()),
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

	const invitation = await invite(user, organization.name);
	await recordAudit(event, {
		actorUserId: actorId,
		action: 'CLIENT_CREATED',
		entityType: 'organization',
		entityId: organization.id,
		metadata: { organizationName: organization.name, userEmail: email, invitationDelivered: invitation.delivered },
	});

	return { organization, user, invitation };
}

/**
 * Locks the account (unusable password, every session revoked) and sends a
 * fresh invitation. Used when a client has lost access or never activated.
 */
export async function resetClientAccess(event: H3Event, actorId: string, userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: { organization: { select: { name: true } } },
	});
	if (!user || user.role !== 'CLIENT') {
		throw createError({ statusCode: 404, statusMessage: 'Client not found' });
	}

	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash: await hashPassword(generateUnusablePassword()), mustChangePassword: true },
	});
	await revokeAllSessions(userId);
	const invitation = await invite(user, user.organization?.name ?? 'your organisation');

	await recordAudit(event, {
		actorUserId: actorId,
		action: 'CLIENT_ACCESS_RESET',
		entityType: 'user',
		entityId: userId,
		metadata: { userEmail: user.email, invitationDelivered: invitation.delivered },
	});

	return { invitation };
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
