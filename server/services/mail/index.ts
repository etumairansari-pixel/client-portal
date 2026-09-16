import { prisma } from '../../utils/prisma.ts';
import { getEnv } from '../../utils/env.ts';
import { log } from '../../utils/log.ts';
import {
	clientInvitationEmail,
	passwordChangedEmail,
	passwordResetEmail,
	workflowEmail,
	isEmailNotificationType,
	type RenderedEmail,
	type ContextRow,
} from './templates.ts';
import {
	combineTransports,
	createFileOutboxTransport,
	createLogTransport,
	createSmtpTransport,
	type MailTransport,
} from './transport.ts';

/**
 * Mail service. Composes templates and hands them to the configured transport.
 *
 * Sending is always best-effort from the caller's point of view: a mail
 * failure is logged (redacted) and never breaks the business action that
 * triggered it.
 */

let transport: MailTransport | null = null;

function getTransport(): MailTransport {
	if (transport) return transport;
	const env = getEnv();

	const parts: MailTransport[] = [];
	if (env.mailEnabled) {
		parts.push(
			createSmtpTransport({
				host: env.SMTP_HOST!,
				port: env.SMTP_PORT,
				secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
				user: env.SMTP_USER,
				pass: env.SMTP_PASS,
				from: env.SMTP_FROM!,
			}),
		);
	} else {
		parts.push(createLogTransport((line) => log.info('mail', line)));
	}
	// Never in production — enforced by env validation.
	if (env.MAIL_OUTBOX_FILE) parts.push(createFileOutboxTransport(env.MAIL_OUTBOX_FILE));

	transport = parts.length === 1 ? parts[0] : combineTransports(...parts);
	log.info('mail', `transport: ${transport.name}`);
	return transport;
}

/** Test hook. */
export function setMailTransport(t: MailTransport | null) {
	transport = t;
}

export interface SendResult {
	/** True only when a real SMTP transport accepted the message. */
	delivered: boolean;
}

export async function sendMail(to: string, mail: RenderedEmail): Promise<SendResult> {
	const env = getEnv();
	try {
		await getTransport().send({ to, ...mail });
		return { delivered: env.mailEnabled };
	} catch (error) {
		log.error('mail', `failed to send "${mail.subject}" to ${to}`, error);
		return { delivered: false };
	}
}

// ---------------------------------------------------------------- account

export async function sendPasswordResetEmail(user: { email: string; firstName?: string | null }, token: string) {
	const { APP_URL } = getEnv();
	const link = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
	return sendMail(user.email, passwordResetEmail(link, { appUrl: APP_URL, firstName: user.firstName }));
}

export function invitationLink(token: string) {
	const { APP_URL } = getEnv();
	return `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}&welcome=1`;
}

export async function sendClientInvitationEmail(
	user: { email: string; firstName?: string | null },
	token: string,
	organizationName: string,
	expiresInHours: number,
) {
	const { APP_URL } = getEnv();
	return sendMail(
		user.email,
		clientInvitationEmail(invitationLink(token), {
			appUrl: APP_URL,
			firstName: user.firstName,
			organizationName,
			expiresInHours,
		}),
	);
}

export async function sendPasswordChangedEmail(user: { email: string; firstName?: string | null }) {
	const { APP_URL } = getEnv();
	return sendMail(user.email, passwordChangedEmail({ appUrl: APP_URL, firstName: user.firstName, when: new Date() }));
}

// --------------------------------------------------------------- workflow

/**
 * Called by the notification service for every in-app notification. Only the
 * whitelisted types produce an email; everything else returns immediately.
 */
export async function sendWorkflowEmailForNotification(input: {
	userId: string;
	type: string;
	title: string;
	body?: string | null;
	link?: string | null;
	context?: ContextRow[];
}) {
	if (!isEmailNotificationType(input.type)) return;
	try {
		const user = await prisma.user.findUnique({
			where: { id: input.userId },
			select: { email: true, firstName: true, status: true },
		});
		if (!user || user.status !== 'ACTIVE') return;
		const { APP_URL } = getEnv();
		await sendMail(
			user.email,
			workflowEmail(
				{ type: input.type, title: input.title, body: input.body, link: input.link, context: input.context },
				{ appUrl: APP_URL, firstName: user.firstName },
			),
		);
	} catch (error) {
		log.error('mail', `workflow email for ${input.type} failed`, error);
	}
}
