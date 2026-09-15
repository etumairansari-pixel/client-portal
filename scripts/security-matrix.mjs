/**
 * Eiretech own-backend security matrix.
 * Exercises the real HTTP API with cookie sessions, exactly as a browser would.
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(58)} ${detail}`);
}

/** Minimal cookie jar so sessions behave like a real browser. */
function jar() {
	let cookie = '';
	return {
		get header() {
			return cookie ? { cookie } : {};
		},
		absorb(res) {
			const set = res.headers.getSetCookie?.() ?? [];
			for (const c of set) {
				const [pair] = c.split(';');
				if (pair.startsWith('eiretech_session=')) cookie = pair;
			}
		},
	};
}

async function call(j, path, { method = 'GET', body } = {}) {
	const res = await fetch(BASE + path, {
		method,
		headers: { 'Content-Type': 'application/json', ...j.header },
		body: body ? JSON.stringify(body) : undefined,
		redirect: 'manual',
	});
	j.absorb(res);
	let data = null;
	try {
		data = await res.json();
	} catch {
		/* non-JSON */
	}
	return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

async function login(email, password) {
	const j = jar();
	const r = await call(j, '/api/auth/login', { method: 'POST', body: { email, password } });
	if (!r.ok) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
	return { j, user: r.data.user, redirect: r.data.redirect };
}

const prisma = new PrismaClient();

async function main() {
	console.log('BASE:', BASE);

	const orgA = await prisma.organization.findFirst({ where: { name: 'Client A Ltd' } });
	const orgB = await prisma.organization.findFirst({ where: { name: 'Client B Ltd' } });
	const projA = await prisma.project.findFirst({ where: { organizationId: orgA.id } });
	const projB = await prisma.project.findFirst({ where: { organizationId: orgB.id } });
	const userB = await prisma.user.findUnique({ where: { email: 'clientb@example.com' } });

	// ---------------------------------------------------- unauthenticated
	console.log(`\n${'='.repeat(104)}\nUNAUTHENTICATED\n${'='.repeat(104)}`);
	const anon = jar();
	for (const [label, path] of [
		['GET /api/auth/me returns null user', '/api/auth/me'],
		['GET /api/portal/dashboard', '/api/portal/dashboard'],
		['GET /api/portal/projects', '/api/portal/projects'],
		['GET /api/admin/clients', '/api/admin/clients'],
		['GET /api/admin/dashboard', '/api/admin/dashboard'],
		['GET /api/account', '/api/account'],
	]) {
		const r = await call(anon, path);
		if (path === '/api/auth/me') check(label, r.ok && r.data?.user === null, 'user=null');
		else check(label + ' denied', r.status === 401, `HTTP ${r.status}`);
	}

	const badLogin = await call(jar(), '/api/auth/login', {
		method: 'POST',
		body: { email: 'clienta@example.com', password: 'wrong-password' },
	});
	check('wrong password rejected', badLogin.status === 401, `HTTP ${badLogin.status}`);

	const ghost = await call(jar(), '/api/auth/login', {
		method: 'POST',
		body: { email: 'nobody@example.com', password: 'whatever' },
	});
	check(
		'unknown email gives same 401 (no enumeration)',
		ghost.status === badLogin.status,
		`HTTP ${ghost.status}`,
	);

	// ---------------------------------------------------- client A
	console.log(`\n${'='.repeat(104)}\nCLIENT A — clienta@example.com\n${'='.repeat(104)}`);
	const A = await login('clienta@example.com', 'ClientALocal!2026');
	check('login succeeds', !!A.user, `role=${A.user.role}`);
	check('login redirect -> /portal', A.redirect === '/portal', A.redirect);

	let r = await call(A.j, '/api/auth/me');
	check('own session resolves', r.data?.user?.email === 'clienta@example.com', r.data?.user?.email);

	r = await call(A.j, '/api/portal/dashboard');
	check('own dashboard', r.ok && r.data?.organization?.id === orgA.id, r.data?.organization?.name);

	r = await call(A.j, '/api/portal/projects');
	const aIds = (r.data?.projects ?? []).map((p) => p.id);
	check('project list is own org only', aIds.length > 0 && aIds.every((id) => id === projA.id), `${aIds.length} project(s)`);

	r = await call(A.j, `/api/portal/projects/${projA.id}`);
	check('own project by id', r.ok, `HTTP ${r.status}`);

	r = await call(A.j, `/api/portal/projects/${projB.id}`);
	check("other tenant's project by id (ID manipulation)", r.status === 404, `HTTP ${r.status}`);

	r = await call(A.j, '/api/account');
	check('own account', r.data?.user?.email === 'clienta@example.com', r.data?.user?.organization?.name);

	console.log('\n  -- admin surface must be closed to a CLIENT --');
	for (const [label, path, opts] of [
		['GET /api/admin/dashboard', '/api/admin/dashboard', {}],
		['GET /api/admin/clients', '/api/admin/clients', {}],
		['GET /api/admin/projects', '/api/admin/projects', {}],
		['GET other client detail', `/api/admin/clients/${orgB.id}`, {}],
		['POST create client', '/api/admin/clients', { method: 'POST', body: { organizationName: 'Hacked', firstName: 'a', lastName: 'b', email: 'hack@example.com' } }],
		['POST create project', '/api/admin/projects', { method: 'POST', body: { organizationId: orgB.id, name: 'Hacked' } }],
		['PATCH other client', `/api/admin/clients/${orgB.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } }],
		['POST reset other client access', `/api/admin/clients/${orgB.id}/reset-access`, { method: 'POST' }],
	]) {
		const res = await call(A.j, path, opts);
		check(label + ' forbidden', res.status === 403, `HTTP ${res.status}`);
	}

	console.log('\n  -- privilege escalation attempts --');
	r = await call(A.j, '/api/account/change-password', {
		method: 'POST',
		body: { currentPassword: 'ClientALocal!2026', newPassword: 'x' },
	});
	check('short password rejected', r.status === 400, `HTTP ${r.status}`);

	r = await call(A.j, '/api/account/change-password', {
		method: 'POST',
		body: { currentPassword: 'wrong', newPassword: 'LongEnough123' },
	});
	check('wrong current password rejected', r.status === 400, `HTTP ${r.status}`);

	// ---------------------------------------------------- client B
	console.log(`\n${'='.repeat(104)}\nCLIENT B — clientb@example.com\n${'='.repeat(104)}`);
	const B = await login('clientb@example.com', 'ClientBLocal!2026');
	r = await call(B.j, '/api/portal/projects');
	const bIds = (r.data?.projects ?? []).map((p) => p.id);
	check('project list is own org only', bIds.length > 0 && bIds.every((id) => id === projB.id), `${bIds.length} project(s)`);

	r = await call(B.j, `/api/portal/projects/${projA.id}`);
	check("other tenant's project by id (ID manipulation)", r.status === 404, `HTTP ${r.status}`);

	r = await call(B.j, `/api/admin/clients/${orgA.id}`);
	check('admin client detail forbidden', r.status === 403, `HTTP ${r.status}`);

	r = await call(B.j, '/api/portal/dashboard');
	check('own dashboard is org B', r.data?.organization?.id === orgB.id, r.data?.organization?.name);

	// ---------------------------------------------------- owner
	console.log(`\n${'='.repeat(104)}\nOWNER — owner@eiretech360.com\n${'='.repeat(104)}`);
	const O = await login('owner@eiretech360.com', 'OwnerLocal!2026');
	check('login redirect -> /admin', O.redirect === '/admin', O.redirect);

	r = await call(O.j, '/api/admin/dashboard');
	check('owner dashboard', r.ok && typeof r.data?.stats?.totalClients === 'number', JSON.stringify(r.data?.stats));

	r = await call(O.j, '/api/admin/clients');
	const orgNames = (r.data?.organizations ?? []).map((o) => o.name);
	check('owner sees ALL clients', orgNames.includes('Client A Ltd') && orgNames.includes('Client B Ltd'), orgNames.join(', '));

	r = await call(O.j, `/api/admin/clients/${orgA.id}`);
	check('owner reads client A', r.ok, r.data?.organization?.name);

	r = await call(O.j, `/api/admin/clients/${orgB.id}`);
	check('owner reads client B', r.ok, r.data?.organization?.name);

	r = await call(O.j, '/api/portal/projects');
	check('owner blocked from CLIENT-only portal API', r.status === 403, `HTTP ${r.status}`);

	// create a client end to end
	const email = `matrix+${Date.now()}@example.com`;
	r = await call(O.j, '/api/admin/clients', {
		method: 'POST',
		body: { organizationName: 'Matrix Test Co', firstName: 'Matrix', lastName: 'Tester', email },
	});
	const created = r.data;
	check('owner creates client', r.ok && !!created?.temporaryPassword, created?.organization?.name);
	check('temporary password returned once', typeof created?.temporaryPassword === 'string' && created.temporaryPassword.length >= 12, 'len=' + created?.temporaryPassword?.length);

	// the brand new client can actually log in with it
	const N = await login(email, created.temporaryPassword);
	check('new client can log in with temp password', N.user?.role === 'CLIENT', N.user?.email);
	check('new client is flagged mustChangePassword', N.user?.mustChangePassword === true, String(N.user?.mustChangePassword));

	// plaintext is never persisted
	const dbUser = await prisma.user.findUnique({ where: { email } });
	check('password stored as argon2 hash only', dbUser.passwordHash.startsWith('$argon2') && !dbUser.passwordHash.includes(created.temporaryPassword), dbUser.passwordHash.slice(0, 18) + '…');

	// owner creates a project for that client
	r = await call(O.j, '/api/admin/projects', {
		method: 'POST',
		body: { organizationId: created.organization.id, name: 'Matrix Project', currentStage: 'PLANNING' },
	});
	check('owner creates project', r.ok, r.data?.project?.name);
	const newProjectId = r.data?.project?.id;

	r = await call(O.j, `/api/admin/projects/${newProjectId}`, { method: 'PATCH', body: { currentStage: 'DESIGN' } });
	check('owner updates project stage', r.data?.project?.currentStage === 'DESIGN', r.data?.project?.currentStage);

	// A temporary password unlocks nothing but the password change itself.
	r = await call(N.j, '/api/portal/projects');
	check('temp-password client is blocked from product APIs', r.status === 403, `HTTP ${r.status}`);

	r = await call(N.j, '/api/auth/change-initial-password', {
		method: 'POST',
		body: { currentPassword: created.temporaryPassword, newPassword: 'ChosenByClient!2026' },
	});
	check('client completes forced password change', r.ok, `redirect ${r.data?.redirect}`);

	// the new tenant now sees only its own project
	r = await call(N.j, '/api/portal/projects');
	const nIds = (r.data?.projects ?? []).map((p) => p.name);
	check('new tenant sees only its own project', nIds.length === 1 && nIds[0] === 'Matrix Project', nIds.join(', '));

	// suspension locks the account out immediately
	r = await call(O.j, `/api/admin/clients/${created.organization.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } });
	check('owner suspends client', r.ok, r.data?.organization?.status);

	r = await call(N.j, '/api/portal/projects');
	check('suspended client session is dead', r.status === 401, `HTTP ${r.status}`);

	// They changed their password above, so use the chosen one here.
	const denied = await call(jar(), '/api/auth/login', { method: 'POST', body: { email, password: 'ChosenByClient!2026' } });
	check('suspended client cannot log back in', denied.status === 403, `HTTP ${denied.status}`);

	// reset access issues a new temp password and kills sessions
	r = await call(O.j, `/api/admin/clients/${created.organization.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } });
	check('owner reactivates client', r.ok, r.data?.organization?.status);

	r = await call(O.j, `/api/admin/clients/${created.organization.id}/reset-access`, { method: 'POST' });
	const reset = r.data;
	check('owner resets client access', r.ok && !!reset?.temporaryPassword, reset?.email);

	const R = await login(email, reset.temporaryPassword);
	check('client logs in with reset password', R.user?.email === email, R.user?.email);

	// ---------------------------------------------------- logout
	console.log(`\n${'='.repeat(104)}\nSESSION LIFECYCLE\n${'='.repeat(104)}`);
	r = await call(A.j, '/api/auth/logout', { method: 'POST' });
	check('logout succeeds', r.ok, `HTTP ${r.status}`);
	r = await call(A.j, '/api/portal/projects');
	check('session invalid after logout', r.status === 401, `HTTP ${r.status}`);

	// ---------------------------------------------------- audit log
	const audits = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 40 });
	const actions = new Set(audits.map((a) => a.action));
	check('audit log records CLIENT_CREATED', actions.has('CLIENT_CREATED'), [...actions].slice(0, 6).join(','));
	check('audit log records PROJECT_CREATED', actions.has('PROJECT_CREATED'), '');
	check('audit log records CLIENT_SUSPENDED', actions.has('CLIENT_SUSPENDED'), '');
	const leaked = audits.filter((a) => JSON.stringify(a.metadata ?? {}).match(/password|secret|token/i));
	check('no secrets in audit metadata', leaked.length === 0, `${leaked.length} suspicious`);

	console.log(`\n${'='.repeat(104)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(104)}`);
	await prisma.$disconnect();
	if (fail) process.exit(1);
}

main().catch(async (e) => {
	console.error('ERROR:', e.message);
	await prisma.$disconnect();
	process.exit(1);
});
