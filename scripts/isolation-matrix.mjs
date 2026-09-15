/**
 * Eiretech symmetric tenant-isolation matrix.
 *
 * Builds an identical delivery fixture for Client A and Client B, then probes
 * every client-reachable resource in BOTH directions (A→B and B→A) using the
 * exact Mongo ObjectIds of the other tenant. Also confirms that body tampering
 * (status / organizationId / resolvedAt / projectId) never escapes the
 * session-derived organization.
 *
 * Run against a dev or production server: BASE=http://localhost:3000
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
	ok ? pass++ : fail++;
	console.log(`  ${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(66)} ${detail}`);
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
	return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}
async function login(email, password) {
	const j = jar();
	const r = await call(j, '/api/auth/login', { method: 'POST', body: { email, password } });
	if (!r.ok) throw new Error(`login failed ${email}: ${r.status}`);
	return { j, user: r.data.user };
}
function pdf(name) {
	const fd = new FormData();
	fd.append('file', new Blob(['%PDF-1.4 isolation'], { type: 'application/pdf' }), name);
	return fd;
}

const prisma = new PrismaClient();
const hr = (t) => console.log(`\n${'='.repeat(110)}\n${t}\n${'='.repeat(110)}`);

/** Build the same delivery fixture for one tenant and return every id a probe needs. */
async function buildFixture(O, C, org, project, tag) {
	const base = `/api/admin/projects/${project.id}`;
	const m = await call(O.j, `${base}/milestones`, { method: 'POST', body: { title: `${tag} milestone`, weight: 10, status: 'IN_PROGRESS', progressPercentage: 40, clientVisible: true } });
	const mi = await call(O.j, `${base}/milestones`, { method: 'POST', body: { title: `${tag} internal milestone`, weight: 10, clientVisible: false } });
	const t = await call(O.j, `${base}/tasks`, { method: 'POST', body: { title: `${tag} task`, clientVisible: true } });
	const ti = await call(O.j, `${base}/tasks`, { method: 'POST', body: { title: `${tag} internal task`, clientVisible: false } });
	const u = await call(O.j, `${base}/updates`, { method: 'POST', body: { title: `${tag} update`, message: `${tag} progress note`, clientVisible: true } });
	const cr = await call(C.j, `/api/portal/projects/${project.id}/change-requests`, { method: 'POST', body: { type: 'BUG', title: `${tag} request`, description: `${tag} description` } });
	const att = await call(C.j, `/api/portal/change-requests/${cr.data?.changeRequest?.id ?? cr.data?.id}/attachments`, { method: 'POST', raw: pdf(`${tag}.pdf`) });
	const crId = cr.data?.changeRequest?.id ?? cr.data?.id;
	await call(O.j, `/api/admin/change-requests/${crId}/transition`, { method: 'POST', body: { to: 'UNDER_REVIEW' } });
	await call(O.j, `/api/admin/change-requests/${crId}/transition`, { method: 'POST', body: { to: 'CLARIFICATION_REQUIRED', note: `${tag} clarify?` } });
	const notif = await prisma.notification.findFirst({ where: { userId: C.user.id }, orderBy: { createdAt: 'desc' } });
	const scopeFile = await prisma.scopeFile.findFirst({ where: { organizationId: org.id } });
	const srsAtt = await prisma.srsAttachment.findFirst({ where: { organizationId: org.id } });
	const msg = await prisma.changeRequestMessage.findFirst({ where: { changeRequestId: crId } });
	const ids = {
		project: project.id,
		milestone: m.data?.milestone?.id ?? m.data?.id,
		internalMilestone: mi.data?.milestone?.id ?? mi.data?.id,
		task: t.data?.task?.id ?? t.data?.id,
		internalTask: ti.data?.task?.id ?? ti.data?.id,
		update: u.data?.update?.id ?? u.data?.id,
		changeRequest: crId,
		message: msg?.id,
		attachment: att.data?.attachment?.id ?? att.data?.id,
		notification: notif?.id,
		scopeFile: scopeFile?.id ?? null,
		srsAttachment: srsAtt?.id ?? null,
	};
	for (const [k, v] of Object.entries(ids)) {
		if (v === undefined) throw new Error(`fixture for ${tag} missing ${k}`);
	}
	return ids;
}

/** Every client-reachable route, hit by `me` with `other`'s exact ids. */
async function probe(label, me, other, otherOrg) {
	hr(`${label} — exact-id access to the other tenant must fail`);
	const r = {};
	r.project = await call(me.j, `/api/portal/projects/${other.project}`);
	check('project detail', r.project.status === 404, `HTTP ${r.project.status}`);
	r.ws = await call(me.j, `/api/portal/projects/${other.project}/workspace`);
	check('project workspace', r.ws.status === 404, `HTTP ${r.ws.status}`);
	r.cr = await call(me.j, `/api/portal/projects/${other.project}/change-requests`, { method: 'POST', body: { type: 'BUG', title: 'x', description: 'y' } });
	check('raise change request on their project', r.cr.status === 404, `HTTP ${r.cr.status}`);
	r.crm = await call(me.j, `/api/portal/projects/${me.ids.project}/change-requests`, { method: 'POST', body: { type: 'BUG', title: 'x', description: 'y', relatedMilestoneId: other.milestone } });
	check('reference their milestone from own project', r.crm.status === 400, `HTTP ${r.crm.status}`);
	r.reply = await call(me.j, `/api/portal/change-requests/${other.changeRequest}/reply`, { method: 'POST', body: { body: 'hello' } });
	check('reply on their change request', r.reply.status === 404, `HTTP ${r.reply.status}`);
	r.att = await call(me.j, `/api/portal/change-requests/${other.changeRequest}/attachments`, { method: 'POST', raw: pdf('x.pdf') });
	check('attach to their change request', r.att.status === 404, `HTTP ${r.att.status}`);
	r.dl = await call(me.j, `/api/cr-attachments/${other.attachment}`);
	check('download their attachment', r.dl.status === 404, `HTTP ${r.dl.status}`);

	const before = await prisma.notification.findUnique({ where: { id: other.notification }, select: { readAt: true } });
	r.notif = await call(me.j, `/api/notifications/${other.notification}/read`, { method: 'POST' });
	const after = await prisma.notification.findUnique({ where: { id: other.notification }, select: { readAt: true } });
	check('mark their notification read → no-op', String(before?.readAt) === String(after?.readAt), `readAt unchanged`);
	const feed = await call(me.j, '/api/notifications');
	const feedIds = (feed.data?.notifications ?? []).map((n) => n.id);
	check('their notification absent from own feed', !feedIds.includes(other.notification), `${feedIds.length} own`);

	if (other.scopeFile) {
		r.sf = await call(me.j, `/api/portal/scope/files/${other.scopeFile}`);
		check('download their scope file', r.sf.status === 404, `HTTP ${r.sf.status}`);
		r.sfd = await call(me.j, `/api/portal/scope/files/${other.scopeFile}`, { method: 'DELETE' });
		check('delete their scope file', r.sfd.status === 404, `HTTP ${r.sfd.status}`);
	} else {
		console.log('  skip  scope file (other tenant has none)');
	}
	if (other.srsAttachment) {
		r.sa = await call(me.j, `/api/srs-attachments/${other.srsAttachment}`);
		check('download their SRS attachment', r.sa.status === 404, `HTTP ${r.sa.status}`);
	} else {
		console.log('  skip  SRS attachment (other tenant has none)');
	}

	// Owner-only routes are closed to every client regardless of id.
	const adminBase = `/api/admin/projects/${other.project}`;
	for (const [name, path, opts] of [
		['admin project detail', adminBase, {}],
		['admin milestone delete', `${adminBase}/milestones/${other.milestone}`, { method: 'DELETE' }],
		['admin task delete', `${adminBase}/tasks/${other.task}`, { method: 'DELETE' }],
		['admin milestone reorder', `${adminBase}/milestones/reorder`, { method: 'POST', body: { orderedIds: [other.milestone] } }],
		['admin update post', `${adminBase}/updates`, { method: 'POST', body: { title: 'x', message: 'y' } }],
		['admin CR transition', `/api/admin/change-requests/${other.changeRequest}/transition`, { method: 'POST', body: { to: 'ACCEPTED' } }],
		['admin CR reply', `/api/admin/change-requests/${other.changeRequest}/reply`, { method: 'POST', body: { body: 'x' } }],
	]) {
		const x = await call(me.j, path, opts);
		check(`${name} → 403`, x.status === 403, `HTTP ${x.status}`);
	}

	// Own workspace must carry none of the other tenant's ids or text.
	const own = await call(me.j, `/api/portal/projects/${me.ids.project}/workspace`);
	const blob = JSON.stringify(own.data ?? {});
	const leaked = Object.entries(other)
		.filter(([, v]) => typeof v === 'string' && v.length === 24 && blob.includes(v))
		.map(([k]) => k);
	check('own workspace carries no foreign ids', leaked.length === 0, leaked.join(',') || 'clean');
	check('own workspace carries no foreign org name', !blob.includes(otherOrg.name), otherOrg.name);
	check('own workspace hides own internal task (exact id)', !blob.includes(me.ids.internalTask), '');
	check('own workspace hides own internal milestone (exact id)', !blob.includes(me.ids.internalMilestone), '');

	// Body tampering on own resources: nothing protected may move.
	const tamperBody = { body: 'tamper', status: 'COMPLETED', organizationId: otherOrg.id, projectId: other.project, resolvedAt: new Date().toISOString() };
	await call(me.j, `/api/portal/change-requests/${me.ids.changeRequest}/reply`, { method: 'POST', body: tamperBody });
	const crRow = await prisma.changeRequest.findUnique({ where: { id: me.ids.changeRequest } });
	check('tampered reply: organizationId unchanged', crRow.organizationId === me.user.organizationId, '');
	check('tampered reply: projectId unchanged', crRow.projectId === me.ids.project, '');
	check('tampered reply: resolvedAt still null', crRow.resolvedAt === null, '');
	check('tampered reply: status is UNDER_REVIEW (not COMPLETED)', crRow.status === 'UNDER_REVIEW', crRow.status);

	const created = await call(me.j, `/api/portal/projects/${me.ids.project}/change-requests`, {
		method: 'POST',
		body: { type: 'BUG', title: 'tamper create', description: 'd', status: 'COMPLETED', organizationId: otherOrg.id, projectId: other.project, resolvedAt: new Date().toISOString() },
	});
	const createdId = created.data?.changeRequest?.id ?? created.data?.id;
	const row = createdId ? await prisma.changeRequest.findUnique({ where: { id: createdId } }) : null;
	check('tampered create: accepted with own org/project only', !!row && row.organizationId === me.user.organizationId && row.projectId === me.ids.project, '');
	check('tampered create: status forced SUBMITTED', row?.status === 'SUBMITTED', row?.status);
	check('tampered create: resolvedAt null', row?.resolvedAt === null, '');
}

async function main() {
	console.log('BASE:', BASE);
	await prisma.changeRequestMessage.deleteMany({});
	await prisma.changeRequestAttachment.deleteMany({});
	await prisma.changeRequest.deleteMany({});
	await prisma.projectUpdate.deleteMany({});
	await prisma.projectTask.deleteMany({});
	await prisma.milestone.deleteMany({});
	await prisma.notification.deleteMany({});

	const orgA = await prisma.organization.findFirst({ where: { name: 'Client A Ltd' } });
	const orgB = await prisma.organization.findFirst({ where: { name: 'Client B Ltd' } });
	const projA = await prisma.project.findFirst({ where: { organizationId: orgA.id } });
	const projB = await prisma.project.findFirst({ where: { organizationId: orgB.id } });

	const O = await login('owner@eiretech360.com', 'OwnerLocal!2026');
	const A = await login('clienta@example.com', 'ClientALocal!2026');
	const B = await login('clientb@example.com', 'ClientBLocal!2026');

	hr('FIXTURES');
	A.ids = await buildFixture(O, A, orgA, projA, 'A');
	B.ids = await buildFixture(O, B, orgB, projB, 'B');
	check('tenant A fixture built', !!A.ids.changeRequest, A.ids.changeRequest);
	check('tenant B fixture built', !!B.ids.changeRequest, B.ids.changeRequest);
	check('fixtures are distinct documents', A.ids.changeRequest !== B.ids.changeRequest, '');

	await probe('CLIENT A → CLIENT B', A, B.ids, orgB);
	await probe('CLIENT B → CLIENT A', B, A.ids, orgA);

	hr('OWNER — sees both, unaffected by client attempts');
	const inbox = await call(O.j, '/api/admin/change-requests');
	const list = inbox.data?.changeRequests ?? inbox.data ?? [];
	const titles = JSON.stringify(list);
	check('owner inbox lists A and B requests', titles.includes('A request') && titles.includes('B request'), `${list.length} total`);
	const crA = await prisma.changeRequest.findUnique({ where: { id: A.ids.changeRequest } });
	const crB = await prisma.changeRequest.findUnique({ where: { id: B.ids.changeRequest } });
	check('A request still under A org', crA.organizationId === orgA.id, '');
	check('B request still under B org', crB.organizationId === orgB.id, '');
	check('no cross-tenant messages on A', (await prisma.changeRequestMessage.count({ where: { changeRequestId: A.ids.changeRequest, authorUserId: B.user.id } })) === 0, '');
	check('no cross-tenant messages on B', (await prisma.changeRequestMessage.count({ where: { changeRequestId: B.ids.changeRequest, authorUserId: A.user.id } })) === 0, '');
	check('no cross-tenant attachments', (await prisma.changeRequestAttachment.count({ where: { OR: [{ changeRequestId: A.ids.changeRequest, organizationId: orgB.id }, { changeRequestId: B.ids.changeRequest, organizationId: orgA.id }] } })) === 0, '');

	console.log(`\n${'='.repeat(110)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(110)}`);
	process.exitCode = fail ? 1 : 0;
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
