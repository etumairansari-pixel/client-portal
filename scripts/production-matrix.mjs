/**
 * Eiretech production-readiness matrix.
 *
 * Exercises the hardening added in Phase 6 over real HTTP: health endpoint,
 * security headers, cookie policy, rate limiting, session revocation on
 * password change, error redaction, upload hardening, and — when the server
 * runs with MAIL_OUTBOX_FILE — the email flows and their content.
 *
 * Works against the dev server or a production build:
 *   BASE=http://localhost:3000 pnpm test:production
 *
 * RUN IT AGAINST A FRESHLY STARTED SERVER. Rate limiting is per process and
 * this suite deliberately exhausts several policies, so back-to-back runs
 * inside a 15-minute window will hit 429 on the second pass — that is the
 * limiter working, not a regression.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';
import { OWNER, CLIENT_A } from './lib/dev-fixtures.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUTBOX = process.env.MAIL_OUTBOX_FILE || '';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
	if (ok) pass++;
	else fail++;
	console.log(`  ${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(66)} ${detail}`);
}
function skip(label, why) {
	console.log(`  skip  ${label.padEnd(66)} ${why}`);
}
function jar() {
	let cookie = '';
	return {
		get header() {
			return cookie ? { cookie } : {};
		},
		absorb(res) {
			for (const c of res.headers.getSetCookie?.() ?? []) {
				const [pair] = c.split(';');
				if (pair.startsWith('eiretech_session=')) cookie = pair;
			}
		},
	};
}
const jsonBody = (body) => (body ? JSON.stringify(body) : undefined);
async function call(j, path, { method = 'GET', body, raw, headers = {} } = {}) {
	const isForm = raw instanceof FormData;
	const res = await fetch(BASE + path, {
		method,
		headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...j.header, ...headers },
		body: isForm ? raw : jsonBody(body),
		redirect: 'manual',
	});
	j.absorb(res);
	let data = null;
	let text = '';
	try {
		text = await res.text();
		data = JSON.parse(text);
	} catch {
		/* not json */
	}
	return { status: res.status, data, text, ok: res.status >= 200 && res.status < 300, res };
}
async function login(email, password) {
	const j = jar();
	const r = await call(j, '/api/auth/login', { method: 'POST', body: { email, password } });
	if (!r.ok) throw new Error(`login failed ${email}: ${r.status}`);
	return { j, user: r.data.user, res: r.res };
}
function upload(name, type, bytes) {
	const fd = new FormData();
	fd.append('file', new Blob([bytes], { type }), name);
	return fd;
}
function outbox() {
	if (!OUTBOX || !existsSync(OUTBOX)) return [];
	return readFileSync(OUTBOX, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

const prisma = new PrismaClient();
const hr = (t) => console.log(`\n${'='.repeat(110)}\n${t}\n${'='.repeat(110)}`);

/**
 * This suite deliberately changes and resets the fixture client's password.
 * Restoring it through the database (not HTTP) means an aborted run, or an
 * exhausted rate-limit window, can never strand the shared fixture.
 */
async function restoreFixturePassword() {
	const u = await prisma.user.findUnique({ where: { email: CLIENT_A.email } });
	if (!u) return;
	await prisma.user.update({
		where: { id: u.id },
		data: { passwordHash: await argonHash(CLIENT_A.password), mustChangePassword: false, status: 'ACTIVE' },
	});
	if (u.organizationId) {
		await prisma.organization.update({ where: { id: u.organizationId }, data: { status: 'ACTIVE' } });
	}
}

async function main() {
	console.log(
		'BASE:',
		BASE,
		OUTBOX ? `| outbox: ${OUTBOX}` : '| outbox: not configured (email content checks skipped)',
	);
	if (OUTBOX) writeFileSync(OUTBOX, '');

	// ------------------------------------------------------------ health
	hr('HEALTH');
	const anon = jar();
	let r = await call(anon, '/api/health');
	check('GET /api/health → 200', r.status === 200, `HTTP ${r.status}`);
	check(
		'reports status/timestamp/database only',
		r.data?.status === 'ok' && r.data?.database === 'up' && !!r.data?.timestamp && Object.keys(r.data).length === 3,
		JSON.stringify(r.data),
	);
	check('no hosts, paths, versions or counts', !/mongodb|\.net|\\\\|C:|version|users|count/i.test(r.text), '');

	// ---------------------------------------------------- security headers
	hr('SECURITY HEADERS');
	const page = await fetch(BASE + '/auth/signin', { redirect: 'manual' });
	const h = (k) => page.headers.get(k);
	const production = !!h('content-security-policy');
	console.log(`  mode: ${production ? 'production (CSP present)' : 'development (CSP skipped by design)'}`);
	check('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff', '');
	check('X-Frame-Options DENY', h('x-frame-options') === 'DENY', '');
	check('Referrer-Policy set', /strict-origin/.test(h('referrer-policy') ?? ''), h('referrer-policy'));
	check('Permissions-Policy set', /camera=\(\)/.test(h('permissions-policy') ?? ''), '');
	check('Cross-Origin-Opener-Policy same-origin', h('cross-origin-opener-policy') === 'same-origin', '');
	if (production) {
		const csp = h('content-security-policy');
		check("CSP frame-ancestors 'none'", /frame-ancestors 'none'/.test(csp), '');
		check("CSP default-src 'self'", /default-src 'self'/.test(csp), '');
		check("CSP object-src 'none'", /object-src 'none'/.test(csp), '');
		check('HSTS set', /max-age=\d+/.test(h('strict-transport-security') ?? ''), h('strict-transport-security'));
	} else {
		skip('CSP / HSTS', 'development mode');
	}
	check(
		'API responses are no-store',
		/no-store/.test(r.res.headers.get('cache-control') ?? ''),
		r.res.headers.get('cache-control'),
	);
	check('no X-Powered-By on pages', !page.headers.get('x-powered-by'), page.headers.get('x-powered-by') ?? '');
	check('no X-Powered-By on API', !r.res.headers.get('x-powered-by'), '');

	// ----------------------------------------------------------- cookies
	hr('SESSION COOKIE');
	const O = await login(OWNER.email, OWNER.password);
	const setCookie = (O.res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('eiretech_session='));
	check('cookie is HttpOnly', /httponly/i.test(setCookie), '');
	check('cookie is SameSite=Lax', /samesite=lax/i.test(setCookie), '');
	check('cookie Path=/', /path=\//i.test(setCookie), '');
	check('cookie has a bounded Max-Age (7 days)', /max-age=604800/i.test(setCookie), '');
	if (production) check('cookie is Secure in production', /;\s*secure/i.test(setCookie), '');
	else check('cookie not Secure in development (localhost http)', !/;\s*secure/i.test(setCookie), '');
	const tokenValue = setCookie.split(';')[0].split('=')[1];
	check(
		'session token is opaque and long',
		tokenValue.length >= 40 && !tokenValue.includes('.'),
		`len=${tokenValue.length}`,
	);

	const A1 = await login(CLIENT_A.email, CLIENT_A.password);
	const A2 = await login(CLIENT_A.email, CLIENT_A.password);
	r = await call(A1.j, '/api/auth/logout', { method: 'POST' });
	const revoked = await prisma.session.findMany({
		where: { userId: A1.user.id, revokedAt: { not: null } },
		orderBy: { revokedAt: 'desc' },
		take: 1,
	});
	check('logout revokes the DB session row', revoked.length === 1 && Date.now() - revoked[0].revokedAt < 10_000, '');
	r = await call(A1.j, '/api/auth/me');
	check('logged-out cookie resolves to no user', r.data?.user === null, '');
	r = await call(A2.j, '/api/auth/me');
	check('other device still signed in', r.data?.user?.email === CLIENT_A.email, '');

	// password change from device 2 signs out everything else, keeps device 2
	const A3 = await login(CLIENT_A.email, CLIENT_A.password);
	r = await call(A2.j, '/api/account/change-password', {
		method: 'POST',
		body: { currentPassword: CLIENT_A.password, newPassword: 'Rotated!Pass2026' },
	});
	check('password change accepted', r.ok, `HTTP ${r.status}`);
	r = await call(A3.j, '/api/auth/me');
	check('password change revokes other sessions', r.data?.user === null, '');
	r = await call(A2.j, '/api/auth/me');
	check('password change keeps the current device signed in', r.data?.user?.email === CLIENT_A.email, '');
	await restoreFixturePassword();

	// --------------------------------------- session revocation & tokens
	hr('SESSION REVOCATION & TOKEN LIFECYCLE');
	const liveSessions = (userId) =>
		prisma.session.count({ where: { userId, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] } });
	const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');

	// Password RESET must kill every session, on every device.
	const S1 = await login(CLIENT_A.email, CLIENT_A.password);
	const S2 = await login(CLIENT_A.email, CLIENT_A.password);
	check('two live sessions before reset', (await liveSessions(S1.user.id)) >= 2, '');
	if (!OUTBOX) {
		skip('password reset revokes all sessions', 'needs MAIL_OUTBOX_FILE to read the reset link');
	} else {
		writeFileSync(OUTBOX, '');
		await call(jar(), '/api/auth/forgot-password', { method: 'POST', body: { email: CLIENT_A.email } });
		const mail = outbox().find((m) => m.to === CLIENT_A.email && /reset-password\?token=/.test(m.text));
		const resetTok = mail
			? new URL(mail.text.match(/https?:\/\/\S+reset-password\?token=[^\s]+/)[0]).searchParams.get('token')
			: null;
		check('reset link delivered with a usable token', !!resetTok, '');
		const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(resetTok ?? 'x') } });
		check(
			'only the token HASH is persisted',
			!!stored && stored.tokenHash.length === 64 && !JSON.stringify(stored).includes(resetTok),
			'',
		);
		check(
			'reset token purpose is RESET with 1h expiry',
			stored?.purpose === 'RESET' && stored.expiresAt - stored.createdAt <= 3600_000,
			stored?.purpose,
		);
		r = await call(jar(), '/api/auth/reset-password', {
			method: 'POST',
			body: { token: resetTok, password: 'ResetFlow!2026' },
		});
		check('reset accepted', r.ok, `HTTP ${r.status}`);
		check('reset revokes EVERY live session', (await liveSessions(S1.user.id)) === 0, '');
		r = await call(S1.j, '/api/auth/me');
		check('device 1 signed out after reset', r.data?.user === null, '');
		r = await call(S2.j, '/api/auth/me');
		check('device 2 signed out after reset', r.data?.user === null, '');
		r = await call(jar(), '/api/auth/reset-password', {
			method: 'POST',
			body: { token: resetTok, password: 'Replayed!2026' },
		});
		check('reset token is single-use', r.status === 400, `HTTP ${r.status}`);
		const back = await login(CLIENT_A.email, 'ResetFlow!2026');
		check('client signs in with the reset password', !!back.user, '');
		await restoreFixturePassword();
		check(
			'fixture password restored for the other suites',
			!!(await login(CLIENT_A.email, CLIENT_A.password)).user,
			'',
		);
	}

	// An expired token is refused even though it was never used.
	const expiredRaw = randomBytes(32).toString('base64url');
	const cUser = await prisma.user.findUnique({ where: { email: CLIENT_A.email } });
	await prisma.passwordResetToken.create({
		data: {
			tokenHash: hashToken(expiredRaw),
			userId: cUser.id,
			purpose: 'RESET',
			usedAt: null,
			expiresAt: new Date(Date.now() - 60_000),
		},
	});
	r = await call(jar(), '/api/auth/reset-password', {
		method: 'POST',
		body: { token: expiredRaw, password: 'Expired!Pass2026' },
	});
	check('expired token rejected', r.status === 400, `HTTP ${r.status}`);
	const stillValid = await prisma.user.findUnique({ where: { email: CLIENT_A.email } });
	check('expired token did not change the password', stillValid.passwordHash === cUser.passwordHash, '');
	await prisma.passwordResetToken.deleteMany({ where: { tokenHash: hashToken(expiredRaw) } });

	// Suspension must revoke session ROWS, not merely fail the status check.
	const orgAForSuspend = await prisma.organization.findFirst({ where: { name: CLIENT_A.organizationName } });
	const S3 = await login(CLIENT_A.email, CLIENT_A.password);
	check('live session before suspension', (await liveSessions(S3.user.id)) >= 1, '');
	await call(O.j, `/api/admin/clients/${orgAForSuspend.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } });
	check('suspension revokes session rows in the database', (await liveSessions(S3.user.id)) === 0, '');
	r = await call(S3.j, '/api/auth/me');
	check('suspended session resolves to no user', r.data?.user === null, '');
	await call(O.j, `/api/admin/clients/${orgAForSuspend.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } });
	r = await call(S3.j, '/api/auth/me');
	check('reactivation does NOT resurrect the revoked session', r.data?.user === null, '');
	const after = await login(CLIENT_A.email, CLIENT_A.password);
	check('client can sign in again after reactivation', !!after.user, '');

	// ------------------------------------------------------ rate limiting
	hr('RATE LIMITING');
	const bogus = `nobody+${Date.now()}@example.com`;
	let last = null;
	for (let i = 0; i < 11; i++)
		last = await call(jar(), '/api/auth/login', { method: 'POST', body: { email: bogus, password: 'wrong-password' } });
	check('11th failed login for one email → 429', last.status === 429, `HTTP ${last.status}`);
	check(
		'429 carries Retry-After',
		Number(last.res.headers.get('retry-after')) > 0,
		last.res.headers.get('retry-after'),
	);
	check(
		'429 body does not reveal whether the account exists',
		!/exist|unknown|not found|invalid email/i.test(last.text),
		'',
	);
	r = await call(jar(), '/api/auth/login', {
		method: 'POST',
		body: { email: OWNER.email, password: 'wrong-password' },
	});
	check('other accounts unaffected (per-email key)', r.status === 401, `HTTP ${r.status}`);
	const O2 = await login(OWNER.email, OWNER.password);
	check('successful login clears failure counter', !!O2.user, '');

	const fp = `forgot+${Date.now()}@example.com`;
	for (let i = 0; i < 3; i++)
		last = await call(jar(), '/api/auth/forgot-password', { method: 'POST', body: { email: fp } });
	check('forgot-password answers ok for unknown addresses', last.status === 200 && last.data?.ok === true, '');
	last = await call(jar(), '/api/auth/forgot-password', { method: 'POST', body: { email: fp } });
	check('4th forgot-password for one email in 15 min → 429', last.status === 429, `HTTP ${last.status}`);
	r = await call(jar(), '/api/auth/reset-password', {
		method: 'POST',
		body: { token: 'not-a-real-token-value', password: 'Whatever!2026' },
	});
	check('reset with bogus token → 400 (not 500)', r.status === 400, `HTTP ${r.status}`);

	// --------------------------------------------------- error redaction
	hr('ERROR HANDLING');
	r = await call(O.j, '/api/admin/projects/not-an-objectid');
	check('malformed id does not 200', r.status >= 400, `HTTP ${r.status}`);
	const leak = /prisma|mongodb|ObjectID|node_modules|\.mjs|at \w+ \(|D:\\|\/home\//i;
	if (production) check('malformed id response leaks no internals', !leak.test(r.text), r.text.slice(0, 80));
	else skip('malformed id internals check', `development mode shows details by design (HTTP ${r.status})`);
	r = await call(anon, '/api/this-route-does-not-exist');
	check('unknown API route → 404', r.status === 404, `HTTP ${r.status}`);
	if (production) check('404 body carries no stack', !/at \w+ \(/.test(r.text), '');
	r = await call(anon, '/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		raw: undefined,
		body: undefined,
	});
	check('empty login body → 400', r.status === 400, `HTTP ${r.status}`);
	const oversized = await fetch(BASE + '/api/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{"email":' + '"a"'.repeat(1) + ', "password": "' + 'x'.repeat(1_000_000) + '"}',
	});
	check('1 MB password rejected (400/413/401, not 5xx)', oversized.status < 500, `HTTP ${oversized.status}`);

	// ----------------------------------------------------- upload hardening
	hr('UPLOAD HARDENING');
	const orgA = await prisma.organization.findFirst({ where: { name: CLIENT_A.organizationName } });
	const projA = await prisma.project.findFirst({ where: { organizationId: orgA.id } });
	const A = await login(CLIENT_A.email, CLIENT_A.password);
	r = await call(A.j, `/api/portal/projects/${projA.id}/change-requests`, {
		method: 'POST',
		body: { type: 'BUG', title: 'upload probe', description: 'd' },
	});
	const crId = r.data?.changeRequest?.id;
	const att = (name, type, bytes) =>
		call(A.j, `/api/portal/change-requests/${crId}/attachments`, { method: 'POST', raw: upload(name, type, bytes) });
	r = await att('evil.exe', 'application/x-msdownload', 'MZ');
	check('.exe rejected', r.status === 400, `HTTP ${r.status}`);
	r = await att('logo.svg', 'image/svg+xml', '<svg onload=alert(1)/>');
	check('SVG rejected', r.status === 400, `HTTP ${r.status}`);
	r = await att('page.html', 'text/html', '<script>1</script>');
	check('HTML rejected', r.status === 400, `HTTP ${r.status}`);
	r = await att('fake.pdf', 'application/pdf', 'MZ this is not a pdf');
	check('PDF with wrong magic bytes rejected', r.status === 400, `HTTP ${r.status}`);
	r = await att('fake.png', 'application/pdf', '%PDF-1.4');
	check('extension/MIME mismatch rejected', r.status === 400, `HTTP ${r.status}`);
	r = await att('../../../etc/passwd.pdf', 'application/pdf', '%PDF-1.4 ok');
	check(
		'traversal filename accepted but sanitised',
		r.ok && r.data?.attachment?.originalName === 'passwd.pdf',
		r.data?.attachment?.originalName,
	);
	r = await att('quote"and\r\nheader.pdf', 'application/pdf', '%PDF-1.4 ok');
	check(
		'header-breaking filename sanitised',
		r.ok && !/["\r\n]/.test(r.data?.attachment?.originalName ?? '"'),
		r.data?.attachment?.originalName,
	);
	const attId = r.data?.attachment?.id;
	const dl = await fetch(BASE + `/api/cr-attachments/${attId}`, { headers: A.j.header });
	check(
		'download is attachment-only with nosniff',
		/^attachment;/.test(dl.headers.get('content-disposition') ?? '') &&
			dl.headers.get('x-content-type-options') === 'nosniff',
		dl.headers.get('content-disposition'),
	);
	const stored = await prisma.changeRequestAttachment.findUnique({ where: { id: attId } });
	check(
		'stored under random tenant-prefixed key',
		new RegExp(`^${orgA.id}/[a-f0-9]{48}$`).test(stored?.storageKey ?? ''),
		stored?.storageKey?.slice(0, 30),
	);
	const anonDl = await fetch(BASE + `/api/cr-attachments/${attId}`);
	check('anonymous download → 401', anonDl.status === 401, `HTTP ${anonDl.status}`);

	// ----------------------------------------------------------- email flows
	hr('EMAIL FLOWS');
	if (!OUTBOX) {
		skip('email content', 'start the server with MAIL_OUTBOX_FILE=.data/outbox.jsonl to verify');
	} else {
		writeFileSync(OUTBOX, '');
		const email = `matrix+${Date.now()}@example.com`;
		r = await call(O.j, '/api/admin/clients', {
			method: 'POST',
			body: { organizationName: 'Matrix Test Co', firstName: 'Mail', lastName: 'Probe', email },
		});
		let mails = outbox();
		const invite = mails.find((m) => m.to === email && /client portal is ready/i.test(m.subject));
		check('invitation email generated', !!invite, invite?.subject);
		check(
			'invitation carries a one-time link with welcome=1',
			/\/auth\/reset-password\?token=[A-Za-z0-9_-]+&welcome=1/.test(invite?.text ?? ''),
			'',
		);
		check('invitation names the organisation', /Matrix Test Co/.test(invite?.html ?? ''), '');
		check(
			'invitation contains no password or hash',
			!/temporary password|\$argon2|password is/i.test(invite?.text ?? 'x'),
			'',
		);
		check(
			'invitation has html + text parts and Eiretech branding',
			/<!doctype html>/i.test(invite?.html ?? '') && /Eiretech/.test(invite?.text ?? ''),
			'',
		);
		check(
			'no staff name or owner email in client mail',
			!new RegExp(OWNER.email).test(invite?.html ?? '') && !/Eiretech Owner/.test(invite?.html ?? ''),
			'',
		);

		// Use the account created moments ago: the per-address forgot-password
		// limiter is in-process, so a shared fixture would throttle on repeat runs.
		await call(jar(), '/api/auth/forgot-password', { method: 'POST', body: { email } });
		mails = outbox();
		const reset = mails.find((m) => m.to === email && /reset your eiretech password/i.test(m.subject));
		check('password reset email generated', !!reset, reset?.subject);
		check(
			'reset link present once, token not logged elsewhere',
			((reset?.text ?? '').match(/reset-password\?token=/g) ?? []).length === 1,
			'',
		);

		r = await call(A.j, '/api/account/change-password', {
			method: 'POST',
			body: { currentPassword: CLIENT_A.password, newPassword: 'Rotated!Pass2026' },
		});
		await call(A.j, '/api/account/change-password', {
			method: 'POST',
			body: { currentPassword: 'Rotated!Pass2026', newPassword: CLIENT_A.password },
		});
		mails = outbox();
		check(
			'password changed email generated',
			mails.filter((m) => m.to === CLIENT_A.email && /password was changed/i.test(m.subject)).length >= 1,
			'',
		);

		// change request lifecycle → owner + client emails
		writeFileSync(OUTBOX, '');
		r = await call(A.j, `/api/portal/projects/${projA.id}/change-requests`, {
			method: 'POST',
			body: { type: 'NEW_FEATURE', title: 'Email probe request', description: 'd' },
		});
		const cr = r.data?.changeRequest?.id;
		await call(O.j, `/api/admin/change-requests/${cr}/transition`, { method: 'POST', body: { to: 'UNDER_REVIEW' } });
		await call(O.j, `/api/admin/change-requests/${cr}/transition`, {
			method: 'POST',
			body: { to: 'CLARIFICATION_REQUIRED', note: 'Which browser?' },
		});
		await call(A.j, `/api/portal/change-requests/${cr}/reply`, { method: 'POST', body: { body: 'Chrome' } });
		await call(O.j, `/api/admin/change-requests/${cr}/transition`, { method: 'POST', body: { to: 'ACCEPTED' } });
		await call(O.j, `/api/admin/change-requests/${cr}/transition`, { method: 'POST', body: { to: 'IN_PROGRESS' } });
		await call(O.j, `/api/admin/change-requests/${cr}/transition`, {
			method: 'POST',
			body: { to: 'COMPLETED', note: 'Done' },
		});
		mails = outbox();
		const toOwner = mails.filter((m) => m.to === OWNER.email);
		const toClient = mails.filter((m) => m.to === CLIENT_A.email);
		check(
			'owner emailed on CR submission',
			toOwner.some((m) => /submitted a change request|New feature from/i.test(m.subject + m.html)),
			`${toOwner.length} owner mails`,
		);
		check(
			'client emailed on clarification',
			toClient.some((m) => /question about your change request/i.test(m.html)),
			'',
		);
		check(
			'client emailed on acceptance',
			toClient.some((m) => /was accepted/i.test(m.html)),
			'',
		);
		check(
			'client emailed on completion',
			toClient.some((m) => /is complete/i.test(m.html)),
			'',
		);
		check(
			'client NOT emailed for under-review / in-progress (in-app only)',
			!toClient.some((m) => /under review|has started/i.test(m.subject)),
			`${toClient.length} client mails`,
		);
		check(
			'client CR emails mention Eiretech, never a staff name',
			toClient.every((m) => /Eiretech/.test(m.html) && !/Eiretech Owner/.test(m.html)),
			'',
		);
		check(
			'CTA links are absolute app URLs',
			toClient.every((m) => /href="https?:\/\/[^"]+\/portal\//.test(m.html)),
			'',
		);
		check(
			'no secrets in workflow mail',
			!mails.some((m) => /\$argon2|mongodb|SESSION_SECRET/i.test(m.html + m.text)),
			'',
		);
	}

	console.log(`\n${'='.repeat(110)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(110)}`);
	process.exitCode = fail ? 1 : 0;
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await restoreFixturePassword().catch(() => undefined);
		await prisma.$disconnect();
	});
