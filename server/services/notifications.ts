import { prisma } from '../utils/prisma';
import { sendWorkflowEmailForNotification } from './mail';

/**
 * In-app notifications. Deliberately best-effort: a notification failure must
 * never break the business action that triggered it.
 *
 * A small whitelist of notification types (see EMAIL_NOTIFICATION_TYPES) is
 * also delivered by email; the mail service decides, so callers stay unaware.
 */
export interface NotifyInput {
	userId: string;
	organizationId?: string | null;
	type: string;
	title: string;
	body?: string;
	link?: string;
}

export async function notify(input: NotifyInput) {
	try {
		await prisma.notification.create({
			data: {
				userId: input.userId,
				organizationId: input.organizationId ?? null,
				type: input.type,
				title: input.title,
				body: input.body ?? null,
				link: input.link ?? null,
				// Stored explicitly so `readAt: null` filters match on Mongo.
				readAt: null,
			},
		});
		// Email delivery is not awaited: an SMTP round-trip must never hold up
		// the HTTP response that triggered it. The mail service logs failures.
		void sendWorkflowEmailForNotification(input);
	} catch {
		// non-fatal
	}
}

/** Fan out to every active Owner. */
export async function notifyOwners(input: Omit<NotifyInput, 'userId' | 'organizationId'>) {
	try {
		const owners = await prisma.user.findMany({
			where: { role: 'OWNER', status: 'ACTIVE' },
			select: { id: true },
		});
		await Promise.all(owners.map((o) => notify({ ...input, userId: o.id })));
	} catch {
		// non-fatal
	}
}

export async function notifyOrganizationClients(
	organizationId: string,
	input: Omit<NotifyInput, 'userId' | 'organizationId'>,
) {
	try {
		const clients = await prisma.user.findMany({
			where: { organizationId, role: 'CLIENT', status: 'ACTIVE' },
			select: { id: true },
		});
		await Promise.all(clients.map((c) => notify({ ...input, userId: c.id, organizationId })));
	} catch {
		// non-fatal
	}
}
