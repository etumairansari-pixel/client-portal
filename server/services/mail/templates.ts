/**
 * Email templates.
 *
 * One responsive layout, many small builders. Every builder returns a fully
 * rendered `{ subject, html, text }` so the transport never needs to know
 * what it is sending. This module is pure: no I/O, no framework globals.
 *
 * Client-facing messages always speak as "Eiretech" — never as a named member
 * of staff — and never carry credentials, hashes or tokens other than the
 * single-use link they exist to deliver.
 */

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

export interface ContextRow {
	label: string;
	value: string;
}

export interface EmailContent {
	subject: string;
	/** Short heading shown above the message. */
	heading: string;
	/** One or more short paragraphs. */
	paragraphs: string[];
	/** Optional label/value rows (project, client, request…). */
	context?: ContextRow[];
	cta?: { label: string; url: string };
	/** Small print under the button, e.g. link expiry. */
	note?: string;
}

const BRAND = {
	name: 'Eiretech',
	primary: '#2F8DE6',
	ink: '#0f172a',
	muted: '#64748b',
	border: '#e2e8f0',
	bg: '#f8fafc',
};

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Only http(s) links are ever rendered as CTAs. */
function safeUrl(url: string): string {
	return /^https?:\/\//i.test(url) ? url : '#';
}

export function renderEmail(content: EmailContent, opts: { appUrl: string; year?: number }): RenderedEmail {
	const year = opts.year ?? new Date().getFullYear();
	const paragraphs = content.paragraphs
		.map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:${BRAND.ink};">${escapeHtml(p)}</p>`)
		.join('');

	const context = content.context?.length
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px 0;border:1px solid ${BRAND.border};border-radius:8px;border-collapse:separate;">
${content.context
	.map(
		(r) =>
			`<tr><td style="padding:9px 12px;font-size:13px;color:${BRAND.muted};width:38%;border-bottom:1px solid ${BRAND.border};">${escapeHtml(r.label)}</td><td style="padding:9px 12px;font-size:13px;color:${BRAND.ink};font-weight:600;border-bottom:1px solid ${BRAND.border};">${escapeHtml(r.value)}</td></tr>`,
	)
	.join('\n')}
</table>`
		: '';

	const cta = content.cta
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px 0;"><tr><td style="background:${BRAND.primary};border-radius:8px;">
<a href="${escapeHtml(safeUrl(content.cta.url))}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(content.cta.label)}</a>
</td></tr></table>`
		: '';

	const note = content.note
		? `<p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(content.note)}</p>`
		: '';

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${BRAND.bg};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;">
<tr><td style="padding:22px 28px 6px 28px;">
<span style="display:inline-block;font-size:18px;font-weight:800;letter-spacing:-0.3px;color:${BRAND.ink};"><span style="color:${BRAND.primary};">●</span> ${BRAND.name}</span>
</td></tr>
<tr><td style="padding:10px 28px 4px 28px;">
<h1 style="margin:0 0 14px 0;font-size:21px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${escapeHtml(content.heading)}</h1>
${paragraphs}
${context}
${cta}
${note}
</td></tr>
<tr><td style="padding:14px 28px 22px 28px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">This message was sent by ${BRAND.name} from <a href="${escapeHtml(opts.appUrl)}" style="color:${BRAND.muted};">${escapeHtml(opts.appUrl.replace(/^https?:\/\//, ''))}</a>. If you were not expecting it, you can safely ignore it.</p>
<p style="margin:6px 0 0 0;font-size:12px;color:${BRAND.muted};">© ${year} ${BRAND.name}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	const textLines = [
		content.heading,
		'',
		...content.paragraphs,
		'',
		...(content.context ?? []).map((r) => `${r.label}: ${r.value}`),
		...(content.cta ? ['', `${content.cta.label}: ${content.cta.url}`] : []),
		...(content.note ? ['', content.note] : []),
		'',
		`— ${BRAND.name} · ${opts.appUrl}`,
	];

	return { subject: content.subject, html, text: textLines.join('\n').replace(/\n{3,}/g, '\n\n') };
}

// ------------------------------------------------------------- account mail

export interface AccountMailOpts {
	appUrl: string;
	firstName?: string | null;
}

export function passwordResetEmail(link: string, o: AccountMailOpts): RenderedEmail {
	return renderEmail(
		{
			subject: 'Reset your Eiretech password',
			heading: 'Reset your password',
			paragraphs: [
				greeting(o.firstName),
				'We received a request to reset the password for your Eiretech account. Use the button below to choose a new one.',
			],
			cta: { label: 'Reset password', url: link },
			note: 'This link works once and expires in 1 hour. If you did not request a reset, no action is needed — your password has not changed.',
		},
		o,
	);
}

export function clientInvitationEmail(
	link: string,
	o: AccountMailOpts & { organizationName: string; expiresInHours: number },
): RenderedEmail {
	return renderEmail(
		{
			subject: 'Your Eiretech client portal is ready',
			heading: 'Welcome to your client portal',
			paragraphs: [
				greeting(o.firstName),
				`Eiretech has set up a client portal for ${o.organizationName}. It is where you will review scope and requirements, follow delivery progress and raise change requests.`,
				'To activate your account, choose a password using the secure link below.',
			],
			context: [{ label: 'Organisation', value: o.organizationName }],
			cta: { label: 'Set your password', url: link },
			note: `This link works once and expires in ${o.expiresInHours} hours. If it has expired, ask Eiretech to send a new invitation.`,
		},
		o,
	);
}

export function passwordChangedEmail(o: AccountMailOpts & { when: Date }): RenderedEmail {
	return renderEmail(
		{
			subject: 'Your Eiretech password was changed',
			heading: 'Password changed',
			paragraphs: [
				greeting(o.firstName),
				'The password for your Eiretech account was just changed and all other sessions were signed out.',
				'If this was you, there is nothing more to do. If it was not, reset your password immediately using the link below and contact Eiretech.',
			],
			context: [{ label: 'When', value: o.when.toUTCString() }],
			cta: { label: 'Reset password', url: `${o.appUrl}/auth/forgot-password` },
		},
		o,
	);
}

function greeting(firstName?: string | null) {
	return firstName ? `Hi ${firstName},` : 'Hello,';
}

// ------------------------------------------------------- workflow mail

/**
 * Notification types that also go out by email, and how each one reads.
 * Everything else (task progress, milestone edits, chat messages, internal
 * review states) stays in-app only.
 */
export const EMAIL_NOTIFICATION_TYPES = {
	SCOPE_SUBMITTED: { heading: 'A client submitted their scope', cta: 'Review scope' },
	CLARIFICATION_REQUIRED: { heading: 'We need a clarification on your scope', cta: 'Open scope' },
	SCOPE_READY_FOR_APPROVAL: { heading: 'Your scope is ready for approval', cta: 'Review and approve' },
	SCOPE_CLIENT_APPROVED: { heading: 'A client approved their scope', cta: 'Open scope' },
	SCOPE_APPROVED: { heading: 'Your scope has been approved', cta: 'View scope' },
	SRS_SENT_FOR_REVIEW: { heading: 'Requirements are ready for your review', cta: 'Review requirements' },
	SRS_CHANGE_REQUESTED: { heading: 'A client requested requirement changes', cta: 'Open requirements' },
	SRS_APPROVED: { heading: 'Requirements approved', cta: 'Open project' },
	PROJECT_READY_FOR_DELIVERY: { heading: 'Your project is approved for delivery', cta: 'Open project' },
	CHANGE_REQUEST_SUBMITTED: { heading: 'A client submitted a change request', cta: 'Review request' },
	CHANGE_REQUEST_CLARIFICATION_REQUIRED: { heading: 'We have a question about your change request', cta: 'Reply' },
	CHANGE_REQUEST_ACCEPTED: { heading: 'Your change request was accepted', cta: 'View request' },
	CHANGE_REQUEST_DECLINED: { heading: 'An update on your change request', cta: 'View request' },
	CHANGE_REQUEST_COMPLETED: { heading: 'Your change request is complete', cta: 'View request' },
} as const;

export type EmailNotificationType = keyof typeof EMAIL_NOTIFICATION_TYPES;

export function isEmailNotificationType(type: string): type is EmailNotificationType {
	return Object.prototype.hasOwnProperty.call(EMAIL_NOTIFICATION_TYPES, type);
}

export interface WorkflowMailInput {
	type: EmailNotificationType;
	title: string;
	body?: string | null;
	/** App-relative link, e.g. /portal/scope */
	link?: string | null;
	context?: ContextRow[];
}

export function workflowEmail(input: WorkflowMailInput, o: AccountMailOpts): RenderedEmail {
	const meta = EMAIL_NOTIFICATION_TYPES[input.type];
	const url = input.link ? `${o.appUrl}${input.link.startsWith('/') ? '' : '/'}${input.link}` : o.appUrl;
	return renderEmail(
		{
			subject: `${input.title} — Eiretech`,
			heading: meta.heading,
			paragraphs: [greeting(o.firstName), input.title, ...(input.body ? [input.body] : [])],
			context: input.context,
			cta: { label: meta.cta, url },
		},
		o,
	);
}
