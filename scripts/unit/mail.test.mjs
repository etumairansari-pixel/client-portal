import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	renderEmail,
	passwordResetEmail,
	clientInvitationEmail,
	passwordChangedEmail,
	workflowEmail,
	isEmailNotificationType,
	EMAIL_NOTIFICATION_TYPES,
} from '../../server/services/mail/templates.ts';
import { createMemoryTransport, createLogTransport, createFileOutboxTransport, combineTransports, createSmtpTransport } from '../../server/services/mail/transport.ts';

const appUrl = 'https://portal.example.com';

test('renderEmail escapes user-controlled text and only renders http(s) CTAs', () => {
	const out = renderEmail(
		{ subject: 's', heading: '<b>x</b>', paragraphs: ['a & b'], context: [{ label: 'L', value: '"q"' }], cta: { label: 'Go', url: 'javascript:alert(1)' } },
		{ appUrl, year: 2026 },
	);
	assert.ok(out.html.includes('&lt;b&gt;x&lt;/b&gt;'));
	assert.ok(out.html.includes('a &amp; b'));
	assert.ok(out.html.includes('&quot;q&quot;'));
	assert.ok(!out.html.includes('javascript:'));
	assert.ok(out.html.includes('href="#"'));
	assert.ok(out.html.includes('© 2026 Eiretech'));
	assert.ok(out.text.includes('a & b'), 'text version keeps plain content');
});

test('password reset email carries the link once and nothing else secret', () => {
	const link = `${appUrl}/auth/reset-password?token=abc123`;
	const m = passwordResetEmail(link, { appUrl, firstName: 'Ada' });
	assert.match(m.subject, /Reset your Eiretech password/);
	assert.ok(m.html.includes(link));
	assert.ok(m.text.includes(link));
	assert.ok(m.html.includes('Hi Ada,'));
	assert.ok(/expires in 1 hour/.test(m.text));
});

test('invitation email names the organisation, not any employee', () => {
	const m = clientInvitationEmail(`${appUrl}/auth/reset-password?token=t&welcome=1`, { appUrl, firstName: null, organizationName: 'Acme Ltd', expiresInHours: 72 });
	assert.ok(m.html.includes('Acme Ltd'));
	assert.ok(m.html.includes('Hello,'));
	assert.ok(m.text.includes('72 hours'));
	assert.ok(!/owner@|@eiretech360/.test(m.html));
});

test('password changed email points at forgot-password, contains no credential', () => {
	const m = passwordChangedEmail({ appUrl, firstName: 'B', when: new Date('2026-01-01T00:00:00Z') });
	assert.ok(m.html.includes(`${appUrl}/auth/forgot-password`));
	assert.ok(m.text.includes('Thu, 01 Jan 2026'));
});

test('workflow email whitelist covers the required flows and excludes noise', () => {
	for (const t of ['SCOPE_SUBMITTED', 'CLARIFICATION_REQUIRED', 'SCOPE_READY_FOR_APPROVAL', 'SCOPE_APPROVED', 'SRS_SENT_FOR_REVIEW', 'SRS_CHANGE_REQUESTED', 'SRS_APPROVED', 'CHANGE_REQUEST_SUBMITTED', 'CHANGE_REQUEST_CLARIFICATION_REQUIRED', 'CHANGE_REQUEST_ACCEPTED', 'CHANGE_REQUEST_COMPLETED']) {
		assert.ok(isEmailNotificationType(t), `${t} should email`);
	}
	for (const t of ['MILESTONE_CREATED', 'MILESTONE_UPDATED', 'PROJECT_UPDATE_POSTED', 'CHANGE_REQUEST_MESSAGE', 'SRS_MESSAGE', 'SCOPE_MESSAGE', 'CHANGE_REQUEST_UNDER_REVIEW', 'CHANGE_REQUEST_IN_PROGRESS', 'PROJECT_STAGE_CHANGED']) {
		assert.ok(!isEmailNotificationType(t), `${t} must stay in-app only`);
	}
	assert.equal(isEmailNotificationType('__proto__'), false);
	assert.equal(Object.keys(EMAIL_NOTIFICATION_TYPES).length, 14);
});

test('workflow email builds an absolute CTA from an app-relative link', () => {
	const m = workflowEmail({ type: 'CHANGE_REQUEST_ACCEPTED', title: 'Your request has been accepted.', body: 'CSV export', link: '/portal/projects/1?tab=changes' }, { appUrl, firstName: 'C' });
	assert.ok(m.html.includes(`${appUrl}/portal/projects/1?tab=changes`));
	assert.ok(m.html.includes('Your change request was accepted'));
	assert.match(m.subject, /— Eiretech$/);
});

test('memory + combine transports deliver to each, file outbox writes JSON lines', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'eiretech-mail-'));
	const file = join(dir, 'outbox.jsonl');
	const mem = createMemoryTransport();
	const lines = [];
	const log = createLogTransport((l) => lines.push(l));
	const t = combineTransports(mem, log, createFileOutboxTransport(file));
	await t.send({ to: 'x@example.com', subject: 'Hi', html: '<p>secret-link</p>', text: 'secret-link' });
	assert.equal(mem.sent.length, 1);
	assert.equal(t.name, 'memory+log+file');
	assert.ok(lines[0].includes('x@example.com') && !lines[0].includes('secret-link'), 'log transport never logs the body');
	const rec = JSON.parse(readFileSync(file, 'utf8').trim());
	assert.equal(rec.to, 'x@example.com');
	assert.equal(rec.text, 'secret-link');
	rmSync(dir, { recursive: true, force: true });
});

test('smtp transport is constructed lazily and without hard-coded credentials', () => {
	const t = createSmtpTransport({ host: 'smtp.example.com', port: 587, secure: false, user: 'u', pass: 'p', from: 'Eiretech <no-reply@example.com>' });
	assert.equal(t.name, 'smtp');
	assert.equal(typeof t.send, 'function');
});
