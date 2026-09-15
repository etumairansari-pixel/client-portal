/**
 * Phase 3 Scope security + lifecycle matrix.
 * Drives the real HTTP API with cookie sessions, exactly as a browser would.
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(58)} ${detail}`);
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

async function call(j, path, { method = 'GET', body, raw } = {}) {
	const isForm = raw instanceof FormData;
	const res = await fetch(BASE + path, {
		method,
		headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...j.header },
		body: isForm ? raw : body ? JSON.stringify(body) : undefined,
		redirect: 'manual',
	});
	j.absorb(res);
	let data = null;
	try {
		data = await res.json();
	} catch {
		/* binary or empty */
	}
	return { status: res.status, data, ok: res.status >= 200 && res.status < 300, res };
}

async function login(email, password) {
	const j = jar();
	const r = await call(j, '/api/auth/login', { method: 'POST', body: { email, password } });
	if (!r.ok) throw new Error(`login failed ${email}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
	return { j, user: r.data.user, redirect: r.data.redirect };
}

const prisma = new PrismaClient();

/** Fill every required question so submission is possible. */
function completeAnswers() {
	return {
		project_name: 'Candy Cloud Online Store',
		project_type: 'E-commerce Store',
		project_description: 'A storefront for our sweets range.',
		problem_solved: 'We cannot sell online today.',
		business_objectives: 'Grow online revenue and reduce phone orders.',
		business_description: 'A confectionery company based in Dublin.',
		target_users: 'Retail customers and wholesale buyers.',
		expected_outcomes: 'A live store with stock sync.',
		main_features: 'Catalogue, cart, checkout, admin panel.',
		first_release_features: 'Catalogue and checkout.',
		client_provides: 'Product photography and copy.',
		contact_name: 'Jane Doe',
		contact_email: 'jane@example.com',
	};
}

async function main() {
	console.log('BASE:', BASE);

	// clean slate
	await prisma.scopeMessage.deleteMany({});
	await prisma.scopeDiscussion.deleteMany({});
	await prisma.scopeApproval.deleteMany({});
	await prisma.scopeVersion.deleteMany({});
	await prisma.scopeFile.deleteMany({});
	await prisma.scope.deleteMany({});
	await prisma.notification.deleteMany({});

	const orgA = await prisma.organization.findFirst({ where: { name: 'Client A Ltd' } });
	const orgB = await prisma.organization.findFirst({ where: { name: 'Client B Ltd' } });

	// ------------------------------------------------ unauthenticated
	console.log(`\n${'='.repeat(104)}\nUNAUTHENTICATED SCOPE ENDPOINTS\n${'='.repeat(104)}`);
	const anon = jar();
	for (const [label, path, opts] of [
		['GET /api/portal/scope', '/api/portal/scope', {}],
		['POST save', '/api/portal/scope/save', { method: 'POST', body: { answers: {} } }],
		['POST submit', '/api/portal/scope/submit', { method: 'POST' }],
		['POST approve', '/api/portal/scope/approve', { method: 'POST' }],
		['GET /api/admin/scopes', '/api/admin/scopes', {}],
		['GET /api/notifications', '/api/notifications', {}],
	]) {
		const r = await call(anon, path, opts);
		check(label + ' → 401', r.status === 401, `HTTP ${r.status}`);
	}

	// ------------------------------------------------ client A lifecycle
	console.log(`\n${'='.repeat(104)}\nCLIENT A — DRAFT → SUBMIT\n${'='.repeat(104)}`);
	const A = await login('clienta@example.com', 'ClientALocal!2026');

	let r = await call(A.j, '/api/portal/scope');
	const scopeA = r.data.scope;
	check('scope auto-created on first open', r.ok && scopeA.status === 'DRAFT', scopeA?.status);
	check('belongs to own organization', scopeA.organizationId === orgA.id, 'ok');

	r = await call(A.j, '/api/portal/scope/save', { method: 'POST', body: { answers: { project_name: 'Partial' }, silent: true } });
	check('autosave (silent) works', r.ok, `completion ${r.data?.scope?.completionPercentage}%`);
	check('completion reflects required-only', r.data?.scope?.completionPercentage === 8, `${r.data?.scope?.completionPercentage}%`);

	r = await call(A.j, '/api/portal/scope/submit', { method: 'POST' });
	check('submit blocked while incomplete', r.status === 400, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/scope/save', { method: 'POST', body: { answers: completeAnswers() } });
	check('draft save reaches 100%', r.data?.scope?.completionPercentage === 100, `${r.data?.scope?.completionPercentage}%`);

	// upload
	const form = new FormData();
	form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'brief.txt');
	form.append('questionKey', 'content_files');
	form.append('sectionKey', 'content');
	r = await call(A.j, '/api/portal/scope/files', { method: 'POST', raw: form });
	const fileA = r.data?.file;
	check('client uploads a scope file', r.ok && !!fileA?.id, fileA?.originalName);

	const badForm = new FormData();
	badForm.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'evil.exe');
	r = await call(A.j, '/api/portal/scope/files', { method: 'POST', raw: badForm });
	check('disallowed file type rejected', r.status === 400, `HTTP ${r.status}`);

	r = await call(A.j, `/api/portal/scope/files/${fileA.id}`);
	check('client downloads own file', r.status === 200, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/scope/submit', { method: 'POST' });
	check('submit succeeds when complete', r.ok && r.data.scope.status === 'SUBMITTED', r.data?.scope?.status);
	check('currentVersion incremented', r.data?.scope?.currentVersion === 1, `v${r.data?.scope?.currentVersion}`);

	r = await call(A.j, '/api/portal/scope/save', { method: 'POST', body: { answers: { project_name: 'tampered' } } });
	check('editing after submit is refused', r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/scope/submit', { method: 'POST' });
	check('double submit refused', r.status === 409, `HTTP ${r.status}`);

	const versions = await prisma.scopeVersion.findMany({ where: { scopeId: scopeA.id } });
	check('immutable version snapshot written', versions.length === 1, `${versions.length} version(s)`);

	// ------------------------------------------------ cross-tenant
	console.log(`\n${'='.repeat(104)}\nCLIENT B — CROSS-TENANT ISOLATION\n${'='.repeat(104)}`);
	const B = await login('clientb@example.com', 'ClientBLocal!2026');

	r = await call(B.j, '/api/portal/scope');
	const scopeB = r.data.scope;
	check('B gets its own scope, not A', scopeB.id !== scopeA.id && scopeB.organizationId === orgB.id, 'ok');

	r = await call(B.j, `/api/portal/scope/files/${fileA.id}`);
	check("B cannot download A's file (exact id)", r.status === 404, `HTTP ${r.status}`);

	r = await call(B.j, '/api/portal/scope/reply', { method: 'POST', body: { discussionId: '507f1f77bcf86cd799439011', body: 'x' } });
	check('B cannot reply to unknown/other discussion', r.status === 404, `HTTP ${r.status}`);

	for (const [label, path, opts] of [
		['GET /api/admin/scopes', '/api/admin/scopes', {}],
		['GET admin scope detail', `/api/admin/scopes/${scopeA.id}`, {}],
		['POST admin status', `/api/admin/scopes/${scopeA.id}/status`, { method: 'POST', body: { status: 'UNDER_REVIEW' } }],
		['POST admin approve', `/api/admin/scopes/${scopeA.id}/approve`, { method: 'POST' }],
		['POST admin clarification', `/api/admin/scopes/${scopeA.id}/discussions`, { method: 'POST', body: { subject: 'x', body: 'y' } }],
	]) {
		const res = await call(B.j, path, opts);
		check('client → ' + label + ' → 403', res.status === 403, `HTTP ${res.status}`);
	}

	// direct field tampering
	r = await call(B.j, '/api/portal/scope/save', {
		method: 'POST',
		body: { answers: { project_name: 'x' }, organizationId: orgA.id, status: 'APPROVED', lockedAt: new Date().toISOString() },
	});
	const afterTamper = await prisma.scope.findUnique({ where: { id: scopeB.id } });
	check(
		'client cannot set organizationId/status/lockedAt',
		afterTamper.organizationId === orgB.id && afterTamper.status === 'DRAFT' && !afterTamper.lockedAt,
		`org=${afterTamper.organizationId === orgB.id} status=${afterTamper.status}`,
	);

	r = await call(B.j, '/api/portal/scope/approve', { method: 'POST' });
	check('client cannot approve before READY', r.status === 409, `HTTP ${r.status}`);

	// ------------------------------------------------ owner review
	console.log(`\n${'='.repeat(104)}\nOWNER — REVIEW → CLARIFY → APPROVE\n${'='.repeat(104)}`);
	const O = await login('owner@eiretech360.com', 'OwnerLocal!2026');

	r = await call(O.j, '/api/admin/scopes');
	check('owner sees all scopes', (r.data?.scopes ?? []).length >= 2, `${r.data?.scopes?.length} scope(s)`);

	r = await call(O.j, '/api/portal/scope');
	check('owner blocked from CLIENT scope API', r.status === 403, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/status`, { method: 'POST', body: { status: 'UNDER_REVIEW' } });
	check('owner starts review', r.ok && r.data.scope.status === 'UNDER_REVIEW', r.data?.scope?.status);

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/discussions`, {
		method: 'POST',
		body: { subject: 'Inventory sync', body: 'Should stock sync between POS and the store?', requiresClientResponse: true },
	});
	const discussion = r.data?.discussion;
	check('owner raises clarification', r.ok && !!discussion?.id, discussion?.subject);

	let sc = await prisma.scope.findUnique({ where: { id: scopeA.id } });
	check('scope moves to CLARIFICATION_REQUIRED', sc.status === 'CLARIFICATION_REQUIRED', sc.status);

	r = await call(B.j, '/api/portal/scope/reply', { method: 'POST', body: { discussionId: discussion.id, body: 'hijack' } });
	check("B cannot reply on A's clarification", r.status === 404, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/scope/reply', { method: 'POST', body: { discussionId: discussion.id, body: 'Yes, near real-time.' } });
	check('A answers the clarification', r.ok, 'replied');

	sc = await prisma.scope.findUnique({ where: { id: scopeA.id } });
	check('scope returns to UNDER_REVIEW', sc.status === 'UNDER_REVIEW', sc.status);

	// client never sees employee identity
	r = await call(A.j, '/api/portal/scope');
	const msgs = (r.data.discussions ?? []).flatMap((d) => d.messages);
	check(
		'client payload exposes no employee identity',
		msgs.length > 0 && msgs.every((m) => !('authorUserId' in m)),
		`${msgs.length} message(s), sides only`,
	);

	r = await call(O.j, '/api/admin/scope-discussions/resolve', { method: 'POST', body: { discussionId: discussion.id } });
	check('owner resolves clarification', r.ok, 'resolved');

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/approve`, { method: 'POST' });
	check('owner cannot approve before client agrees', r.status === 409, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/status`, { method: 'POST', body: { status: 'READY_FOR_APPROVAL' } });
	check('owner marks ready for approval', r.ok && r.data.scope.status === 'READY_FOR_APPROVAL', r.data?.scope?.status);

	r = await call(B.j, '/api/portal/scope/approve', { method: 'POST' });
	check("B cannot approve A's scope", r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/scope/approve', { method: 'POST', body: { statement: 'Happy to proceed.' } });
	check('client approves', r.ok && !!r.data.scope.clientApprovedAt, 'client agreed');

	sc = await prisma.scope.findUnique({ where: { id: scopeA.id } });
	check('still not APPROVED until owner confirms', sc.status === 'READY_FOR_APPROVAL' && !sc.lockedAt, sc.status);

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/approve`, { method: 'POST' });
	check('owner final-approves', r.ok && r.data.scope.status === 'APPROVED', r.data?.scope?.status);
	check('scope is locked', !!r.data?.scope?.lockedAt, 'lockedAt set');

	// ------------------------------------------------ locked
	console.log(`\n${'='.repeat(104)}\nLOCKED SCOPE\n${'='.repeat(104)}`);
	r = await call(A.j, '/api/portal/scope/save', { method: 'POST', body: { answers: { project_name: 'after lock' } } });
	check('client cannot edit an approved scope', r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/scope/reply', { method: 'POST', body: { discussionId: discussion.id, body: 'more' } });
	check('client cannot post to a locked scope', r.status === 409, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/discussions`, { method: 'POST', body: { subject: 'x', body: 'y' } });
	check('owner cannot reopen a locked scope', r.status === 409, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/scopes/${scopeA.id}/status`, { method: 'POST', body: { status: 'UNDER_REVIEW' } });
	check('owner cannot re-status a locked scope', r.status === 409, `HTTP ${r.status}`);

	const finalVersions = await prisma.scopeVersion.findMany({ where: { scopeId: scopeA.id } });
	check('historical version preserved', finalVersions.length === 1 && finalVersions[0].versionNumber === 1, `v${finalVersions[0]?.versionNumber}`);

	// ------------------------------------------------ notifications + audit
	console.log(`\n${'='.repeat(104)}\nNOTIFICATIONS & AUDIT\n${'='.repeat(104)}`);
	r = await call(A.j, '/api/notifications');
	const aNotes = r.data?.notifications ?? [];
	check('client receives notifications', aNotes.length > 0, `${aNotes.length}`);
	check('client notifications are own-user only', aNotes.every((n) => n.userId === A.user.id), 'ok');

	r = await call(O.j, '/api/notifications');
	check('owner receives notifications', (r.data?.notifications ?? []).length > 0, `${r.data?.notifications?.length}`);

	const actions = new Set((await prisma.auditLog.findMany({ take: 100, orderBy: { createdAt: 'desc' } })).map((a) => a.action));
	for (const a of [
		'SCOPE_CREATED',
		'SCOPE_SUBMITTED',
		'SCOPE_REVIEW_STARTED',
		'CLARIFICATION_REQUESTED',
		'CLARIFICATION_RESPONDED',
		'SCOPE_READY_FOR_APPROVAL',
		'SCOPE_CLIENT_APPROVED',
		'SCOPE_APPROVED',
	]) {
		check(`audit: ${a}`, actions.has(a), '');
	}

	const leaky = (await prisma.auditLog.findMany({ take: 200 })).filter((a) =>
		JSON.stringify(a.metadata ?? {}).match(/password|secret|token|storageKey/i),
	);
	check('no secrets in audit metadata', leaky.length === 0, `${leaky.length} suspicious`);

	console.log(`\n${'='.repeat(104)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(104)}`);
	await prisma.$disconnect();
	if (fail) process.exit(1);
}

main().catch(async (e) => {
	console.error('ERROR:', e.message);
	await prisma.$disconnect();
	process.exit(1);
});
