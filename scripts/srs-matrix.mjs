/**
 * Phase 4 Requirements/SRS security + lifecycle matrix.
 * Drives the real HTTP API with cookie sessions, exactly as a browser would.
 *
 * Fixture: Client A's scope is APPROVED; Client B has no approved scope.
 */
import { PrismaClient } from '@prisma/client';
import { OWNER, CLIENT_A, CLIENT_B } from './lib/dev-fixtures.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
	if (ok) pass++;
	else fail++;
	console.log(`  ${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(60)} ${detail}`);
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
async function call(j, path, { method = 'GET', body, raw } = {}) {
	const isForm = raw instanceof FormData;
	const res = await fetch(BASE + path, {
		method,
		headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...j.header },
		body: isForm ? raw : jsonBody(body),
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

function pdf(name = 'srs.pdf') {
	const fd = new FormData();
	fd.append('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), name);
	return fd;
}

const prisma = new PrismaClient();
const hr = (t) => console.log(`\n${'='.repeat(108)}\n${t}\n${'='.repeat(108)}`);

async function main() {
	console.log('BASE:', BASE);

	// clean slate for SRS + notifications
	await prisma.requirementMessage.deleteMany({});
	await prisma.requirementDiscussion.deleteMany({});
	await prisma.requirementApproval.deleteMany({});
	await prisma.srsAttachment.deleteMany({});
	await prisma.srsRequirement.deleteMany({});
	await prisma.srsVersion.deleteMany({});
	await prisma.srsDocument.deleteMany({});
	await prisma.notification.deleteMany({});
	await prisma.project.updateMany({ data: { readyForDeliveryAt: null } });

	const orgA = await prisma.organization.findFirst({ where: { name: CLIENT_A.organizationName } });
	const orgB = await prisma.organization.findFirst({ where: { name: CLIENT_B.organizationName } });
	const projA = await prisma.project.findFirst({ where: { organizationId: orgA.id } });
	const projB = await prisma.project.findFirst({ where: { organizationId: orgB.id } });
	await prisma.project.update({ where: { id: projA.id }, data: { currentStage: 'PLANNING' } });

	// Fixture: A approved, B not approved.
	const now = new Date();
	const existingA = await prisma.scope.findFirst({ where: { organizationId: orgA.id } });
	if (existingA) {
		await prisma.scope.update({
			where: { id: existingA.id },
			data: { status: 'APPROVED', approvedAt: now, lockedAt: now, clientApprovedAt: now, completionPercentage: 100 },
		});
	} else {
		await prisma.scope.create({
			data: {
				organizationId: orgA.id,
				status: 'APPROVED',
				answers: { project_name: 'Fixture' },
				approvedAt: now,
				lockedAt: now,
				completionPercentage: 100,
				currentVersion: 1,
			},
		});
	}
	await prisma.scope.updateMany({
		where: { organizationId: orgB.id, status: 'APPROVED' },
		data: { status: 'DRAFT', approvedAt: null, lockedAt: null },
	});

	// ------------------------------------------------ unauthenticated
	hr('UNAUTHENTICATED SRS ENDPOINTS');
	const anon = jar();
	for (const [label, path, opts] of [
		['POST /api/admin/srs', '/api/admin/srs', { method: 'POST', body: { projectId: projA.id } }],
		['GET /api/admin/srs/x', '/api/admin/srs/000000000000000000000000', {}],
		['GET /api/admin/projects/:id', `/api/admin/projects/${projA.id}`, {}],
		['GET /api/portal/requirements', '/api/portal/requirements', {}],
		[
			'POST request-changes',
			'/api/portal/requirements/request-changes',
			{ method: 'POST', body: { subject: 'x', body: 'y' } },
		],
		['POST approve', '/api/portal/requirements/approve', { method: 'POST' }],
		['GET portal workspace', `/api/portal/projects/${projA.id}/workspace`, {}],
		['GET srs attachment', '/api/srs-attachments/000000000000000000000000', {}],
	]) {
		const r = await call(anon, path, opts);
		check(label + ' → 401', r.status === 401, `HTTP ${r.status}`);
	}

	// ------------------------------------------------ role boundaries
	hr('ROLE BOUNDARIES');
	const O = await login(OWNER.email, OWNER.password);
	const A = await login(CLIENT_A.email, CLIENT_A.password);
	const B = await login(CLIENT_B.email, CLIENT_B.password);

	let r = await call(A.j, '/api/admin/srs', { method: 'POST', body: { projectId: projA.id } });
	check('client → POST /api/admin/srs → 403', r.status === 403, `HTTP ${r.status}`);
	r = await call(A.j, `/api/admin/projects/${projA.id}`);
	check('client → GET /api/admin/projects/:id → 403', r.status === 403, `HTTP ${r.status}`);
	r = await call(O.j, '/api/portal/requirements');
	check('owner → GET /api/portal/requirements → 403', r.status === 403, `HTTP ${r.status}`);
	r = await call(O.j, `/api/portal/projects/${projA.id}/workspace`);
	check('owner → client workspace → 403', r.status === 403, `HTTP ${r.status}`);

	// ------------------------------------------------ create
	hr('OWNER — CREATE AGAINST APPROVED SCOPE');
	r = await call(O.j, '/api/admin/srs', { method: 'POST', body: { projectId: projB.id } });
	check('create refused when scope NOT approved (B)', r.status === 409, `HTTP ${r.status}`);

	r = await call(O.j, '/api/admin/srs', { method: 'POST', body: { projectId: projA.id } });
	const srs = r.data?.document;
	check('create succeeds for approved scope (A)', r.ok && srs?.status === 'DRAFT', srs?.status);
	check('srs bound to org A', srs?.organizationId === orgA.id, 'ok');
	check('srs references the approved scope', !!srs?.scopeId, srs?.scopeId ? 'scopeId set' : 'missing');

	r = await call(O.j, '/api/admin/srs', { method: 'POST', body: { projectId: projA.id } });
	check('create is idempotent per project', r.ok && r.data.document.id === srs.id, 'same id');

	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	check(
		'owner workspace shows srs + scope',
		r.ok && r.data.srs?.id === srs.id && r.data.scope?.status === 'APPROVED',
		'ok',
	);
	check('owner workspace: project not ready yet', !r.data.project.readyForDeliveryAt, 'readyForDeliveryAt null');

	// ------------------------------------------------ draft is invisible to client
	hr('DRAFT INVISIBLE TO CLIENT');
	r = await call(A.j, `/api/portal/requirements?projectId=${projA.id}`);
	check('client A sees no document while DRAFT', r.ok && r.data.document === null, 'document null');
	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	check('client A workspace: srs null while DRAFT', r.ok && r.data.srs === null, 'ok');
	r = await call(B.j, `/api/portal/projects/${projA.id}/workspace`);
	check("client B cannot open A's workspace (ID manipulation)", r.status === 404, `HTTP ${r.status}`);

	// ------------------------------------------------ authoring
	hr('OWNER — AUTHORING');
	r = await call(O.j, `/api/admin/srs/${srs.id}`, {
		method: 'PATCH',
		body: { title: 'Candy Cloud SRS', content: { project_overview: 'Online store.' }, silent: true },
	});
	check('autosave (silent) works', r.ok && r.data.document.title === 'Candy Cloud SRS', 'saved');

	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { kind: 'FR', title: 'Customer login', priority: 'MUST_HAVE' },
	});
	const fr1 = r.data?.requirement;
	check('FR-001 created', r.ok && fr1?.ref === 'FR-001', fr1?.ref);
	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { kind: 'FR', title: 'Checkout', priority: 'MUST_HAVE' },
	});
	const fr2 = r.data?.requirement;
	check('FR-002 created', r.ok && fr2?.ref === 'FR-002', fr2?.ref);
	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { kind: 'NFR', title: 'Page load < 2s', priority: 'SHOULD_HAVE' },
	});
	check('NFR-001 numbered independently', r.ok && r.data.requirement.ref === 'NFR-001', r.data?.requirement?.ref);

	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { requirementId: fr1.id, title: 'Customer login (email + password)', state: 'CONFIRMED' },
	});
	check(
		'edit keeps stable ref',
		r.ok && r.data.requirement.ref === 'FR-001' && r.data.requirement.state === 'CONFIRMED',
		r.data?.requirement?.ref,
	);

	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { requirementId: fr1.id, title: fr1.title, state: 'REMOVED' },
	});
	check('remove marks REMOVED (not deleted)', r.ok && r.data.requirement.state === 'REMOVED', 'ok');
	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { kind: 'FR', title: 'Order history' },
	});
	check('removed ref never reused → FR-003', r.ok && r.data.requirement.ref === 'FR-003', r.data?.requirement?.ref);

	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, { method: 'POST', body: { kind: 'FR', title: '' } });
	check('empty requirement title rejected', r.status === 400, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/srs/${srs.id}/attachments`, { method: 'POST', raw: pdf() });
	const att = r.data?.attachment;
	check('owner uploads SRS attachment', r.ok && !!att?.id, att?.originalName);
	const fdBad = new FormData();
	fdBad.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'evil.exe');
	r = await call(O.j, `/api/admin/srs/${srs.id}/attachments`, { method: 'POST', raw: fdBad });
	check('disallowed attachment type rejected', r.status === 400, `HTTP ${r.status}`);

	r = await call(A.j, `/api/srs-attachments/${att.id}`);
	check('client A cannot download while DRAFT', r.status === 404, `HTTP ${r.status}`);
	r = await call(O.j, `/api/srs-attachments/${att.id}`);
	check('owner downloads attachment', r.status === 200, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/srs/${srs.id}/ready`, { method: 'POST' });
	check('ready-for-approval refused before any send', r.status === 409, `HTTP ${r.status}`);

	// ------------------------------------------------ send v1.0
	hr('VERSION 1.0 → CLIENT REVIEW');
	r = await call(O.j, `/api/admin/srs/${srs.id}/send`, { method: 'POST' });
	check('send → CLIENT_REVIEW', r.ok && r.data.document.status === 'CLIENT_REVIEW', r.data?.document?.status);
	check('currentVersion = 1', r.data?.document?.currentVersion === 1, `v${r.data?.document?.currentVersion}`);
	let versions = await prisma.srsVersion.findMany({
		where: { srsDocumentId: srs.id },
		orderBy: { versionNumber: 'asc' },
	});
	check(
		'immutable version 1.0 snapshot written',
		versions.length === 1 && versions[0].versionLabel === '1.0',
		versions[0]?.versionLabel,
	);
	check(
		'snapshot carries requirements',
		Array.isArray(versions[0]?.requirements) && versions[0].requirements.length >= 3,
		`${versions[0]?.requirements?.length} req(s)`,
	);

	r = await call(O.j, `/api/admin/srs/${srs.id}`, {
		method: 'PATCH',
		body: { content: { project_overview: 'edited' } },
	});
	check('owner cannot edit while with client', r.status === 409, `HTTP ${r.status}`);
	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { kind: 'FR', title: 'Sneaky' },
	});
	check('owner cannot add requirement while with client', r.status === 409, `HTTP ${r.status}`);

	// ------------------------------------------------ client visibility
	hr('CLIENT VISIBILITY + ISOLATION');
	r = await call(A.j, `/api/portal/requirements?projectId=${projA.id}`);
	const cdoc = r.data?.document;
	check('client A now sees the document', r.ok && cdoc?.id === srs.id && cdoc.status === 'CLIENT_REVIEW', cdoc?.status);
	check('client sees version 1.0', r.data.versions?.[0]?.versionLabel === '1.0', r.data.versions?.[0]?.versionLabel);
	check(
		'client does not see REMOVED requirements',
		(r.data.requirements ?? []).every((q) => q.state !== 'REMOVED'),
		`${r.data.requirements?.length} visible`,
	);
	check(
		'client sees attachment listed',
		(r.data.attachments ?? []).some((a) => a.id === att.id),
		'ok',
	);
	check(
		'client payload has no createdById/approvedById users',
		!JSON.stringify(r.data).includes(O.user.id),
		'owner id absent',
	);

	r = await call(A.j, `/api/srs-attachments/${att.id}`);
	check('client A downloads once shared', r.status === 200, `HTTP ${r.status}`);
	r = await call(B.j, `/api/srs-attachments/${att.id}`);
	check("client B cannot download A's attachment (exact id)", r.status === 404, `HTTP ${r.status}`);
	r = await call(B.j, `/api/portal/requirements?projectId=${projA.id}`);
	check("client B gets nothing for A's projectId", r.ok && r.data.document === null, 'document null');
	r = await call(B.j, '/api/portal/requirements/approve', { method: 'POST', body: { projectId: projA.id } });
	check("client B cannot approve A's requirements", r.status === 404, `HTTP ${r.status}`);
	r = await call(B.j, '/api/portal/requirements/request-changes', {
		method: 'POST',
		body: { projectId: projA.id, subject: 'x', body: 'y' },
	});
	check("client B cannot request changes on A's doc", r.status === 404, `HTTP ${r.status}`);

	// ------------------------------------------------ changes requested
	hr('CLIENT A — REQUEST CHANGES → NEW VERSION');
	r = await call(A.j, '/api/portal/requirements/approve', { method: 'POST', body: { projectId: projA.id } });
	check('approve refused while CLIENT_REVIEW', r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, '/api/portal/requirements/request-changes', {
		method: 'POST',
		body: {
			projectId: projA.id,
			subject: 'Guest checkout',
			body: 'FR-002 must allow guest checkout.',
			requirementRef: 'FR-002',
		},
	});
	const disc = r.data?.discussion;
	check(
		'request changes → CHANGES_REQUESTED',
		r.ok && r.data.document.status === 'CHANGES_REQUESTED',
		r.data?.document?.status,
	);
	check(
		'discussion anchored to FR-002',
		disc?.requirementRef === 'FR-002' && disc?.openedSide === 'CLIENT',
		disc?.requirementRef,
	);

	r = await call(O.j, `/api/admin/srs/${srs.id}/ready`, { method: 'POST' });
	check('ready refused while CHANGES_REQUESTED', r.status === 409, `HTTP ${r.status}`);

	r = await call(O.j, `/api/admin/srs/${srs.id}`, {
		method: 'PATCH',
		body: { content: { project_overview: 'Online store with guest checkout.' } },
	});
	check('owner can edit again after changes requested', r.ok, 'saved');
	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, {
		method: 'POST',
		body: { requirementId: fr2.id, title: 'Checkout (guest + account)' },
	});
	check('owner updates FR-002 in place', r.ok && r.data.requirement.ref === 'FR-002', 'ok');

	r = await call(B.j, '/api/portal/requirements/reply', {
		method: 'POST',
		body: { discussionId: disc.id, body: 'hijack' },
	});
	check("client B cannot reply on A's discussion", r.status === 404, `HTTP ${r.status}`);
	r = await call(O.j, '/api/admin/srs-discussions/reply', {
		method: 'POST',
		body: { discussionId: disc.id, body: 'Updated FR-002 for guest checkout.' },
	});
	check('owner replies', r.ok, 'ok');
	r = await call(A.j, '/api/portal/requirements/reply', {
		method: 'POST',
		body: { discussionId: disc.id, body: 'Great, thanks.' },
	});
	check('client A replies', r.ok, 'ok');

	r = await call(A.j, `/api/portal/requirements?projectId=${projA.id}`);
	const msgs = r.data.discussions?.[0]?.messages ?? [];
	check('client sees both sides of the thread', msgs.length === 3, `${msgs.length} message(s)`);
	check(
		'client never sees authorUserId',
		msgs.every((m) => !('authorUserId' in m)),
		'stripped',
	);
	check(
		'client sees only EIRETECH / CLIENT',
		msgs.every((m) => ['EIRETECH', 'CLIENT'].includes(m.authorSide)),
		'ok',
	);

	r = await call(O.j, `/api/admin/srs/${srs.id}/send`, { method: 'POST' });
	check(
		'send v1.1 → CLIENT_REVIEW',
		r.ok && r.data.document.status === 'CLIENT_REVIEW' && r.data.document.currentVersion === 2,
		`v${r.data?.document?.currentVersion}`,
	);
	versions = await prisma.srsVersion.findMany({ where: { srsDocumentId: srs.id }, orderBy: { versionNumber: 'asc' } });
	check(
		'two immutable versions (1.0, 1.1)',
		versions.map((v) => v.versionLabel).join(',') === '1.0,1.1',
		versions.map((v) => v.versionLabel).join(','),
	);
	check('v1.0 snapshot unchanged', versions[0].content?.project_overview === 'Online store.', 'frozen');

	r = await call(O.j, `/api/admin/srs/${srs.id}/ready`, { method: 'POST' });
	check('ready refused while discussion OPEN', r.status === 409, `HTTP ${r.status}`);
	r = await call(O.j, '/api/admin/srs-discussions/resolve', { method: 'POST', body: { discussionId: disc.id } });
	check('owner resolves discussion', r.ok, 'ok');
	r = await call(O.j, `/api/admin/srs/${srs.id}/ready`, { method: 'POST' });
	check(
		'ready → READY_FOR_APPROVAL',
		r.ok && r.data.document.status === 'READY_FOR_APPROVAL',
		r.data?.document?.status,
	);

	// ------------------------------------------------ approval + lock
	hr('CLIENT A — APPROVE → LOCK → PROJECT READY');
	r = await call(A.j, '/api/portal/requirements/approve', {
		method: 'POST',
		body: { projectId: projA.id, statement: 'Approved.' },
	});
	check('client approves', r.ok && r.data.document.status === 'APPROVED', r.data?.document?.status);
	check('requirements locked', !!r.data?.document?.lockedAt, 'lockedAt set');
	const approval = await prisma.requirementApproval.findFirst({ where: { srsDocumentId: srs.id } });
	check(
		'approval record for version 1.1',
		approval?.versionLabel === '1.1' && approval.clientApprovedById === A.user.id,
		approval?.versionLabel,
	);

	const pA = await prisma.project.findUnique({ where: { id: projA.id } });
	check('project READY FOR DELIVERY', !!pA.readyForDeliveryAt, 'readyForDeliveryAt set');
	check('stage is PLANNING (not faked forward)', pA.currentStage === 'PLANNING', pA.currentStage);
	const pB = await prisma.project.findUnique({ where: { id: projB.id } });
	check('project B untouched', !pB.readyForDeliveryAt, 'ok');

	hr('LOCKED REQUIREMENTS');
	r = await call(O.j, `/api/admin/srs/${srs.id}`, { method: 'PATCH', body: { content: { project_overview: 'x' } } });
	check('owner cannot edit locked srs', r.status === 409, `HTTP ${r.status}`);
	r = await call(O.j, `/api/admin/srs/${srs.id}/requirements`, { method: 'POST', body: { kind: 'FR', title: 'late' } });
	check('owner cannot add requirement to locked srs', r.status === 409, `HTTP ${r.status}`);
	r = await call(O.j, `/api/admin/srs/${srs.id}/attachments`, { method: 'POST', raw: pdf('late.pdf') });
	check('owner cannot attach to locked srs', r.status === 409, `HTTP ${r.status}`);
	r = await call(O.j, `/api/admin/srs/${srs.id}/send`, { method: 'POST' });
	check('owner cannot send a locked srs', r.status === 409, `HTTP ${r.status}`);
	r = await call(A.j, '/api/portal/requirements/request-changes', {
		method: 'POST',
		body: { projectId: projA.id, subject: 'late', body: 'late' },
	});
	check('client cannot request changes on locked srs', r.status === 409, `HTTP ${r.status}`);
	r = await call(A.j, '/api/portal/requirements/reply', {
		method: 'POST',
		body: { discussionId: disc.id, body: 'late' },
	});
	check('client cannot post to locked srs', r.status === 409, `HTTP ${r.status}`);
	r = await call(A.j, '/api/portal/requirements/approve', { method: 'POST', body: { projectId: projA.id } });
	check('double approve refused', r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	check(
		'client workspace reflects APPROVED + ready',
		r.ok && r.data.srs?.status === 'APPROVED' && !!r.data.project.readyForDeliveryAt,
		'ok',
	);
	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	check(
		'owner workspace activity is project-scoped',
		r.ok &&
			r.data.activity.length > 0 &&
			r.data.activity.every((a) =>
				[
					'project',
					'scope',
					'srs_document',
					'srs_requirement',
					'srs_attachment',
					'requirement_discussion',
					'milestone',
					'project_task',
					'project_update',
					'change_request',
				].includes(a.entityType),
			),
		`${r.data?.activity?.length} entries`,
	);

	// ------------------------------------------------ notifications + audit
	hr('NOTIFICATIONS + AUDIT');
	const aNotes = await prisma.notification.findMany({ where: { userId: A.user.id } });
	const bNotes = await prisma.notification.findMany({ where: { userId: B.user.id } });
	check('client A notified', aNotes.length > 0, `${aNotes.length}`);
	check('client B received nothing about A', bNotes.length === 0, `${bNotes.length}`);
	check(
		'notification bodies contain no employee names',
		aNotes.every((n) => !/owner@|Owner /i.test(n.body ?? '')),
		'ok',
	);
	r = await call(O.j, '/api/notifications');
	check('owner notified', (r.data?.notifications ?? []).length > 0, `${r.data?.notifications?.length}`);

	const actions = new Set(
		(await prisma.auditLog.findMany({ take: 200, orderBy: { createdAt: 'desc' } })).map((a) => a.action),
	);
	for (const a of [
		'SRS_CREATED',
		'SRS_REQUIREMENT_SAVED',
		'SRS_ATTACHMENT_UPLOADED',
		'SRS_SENT_FOR_REVIEW',
		'SRS_CHANGE_REQUESTED',
		'SRS_MESSAGE_POSTED',
		'SRS_DISCUSSION_RESOLVED',
		'SRS_READY_FOR_APPROVAL',
		'SRS_APPROVED',
		'PROJECT_READY_FOR_DELIVERY',
	]) {
		check(`audit: ${a}`, actions.has(a), '');
	}
	const leaky = (await prisma.auditLog.findMany({ take: 300 })).filter((a) =>
		JSON.stringify(a.metadata ?? {}).match(/password|secret|token|storageKey/i),
	);
	check('no secrets in audit metadata', leaky.length === 0, `${leaky.length} suspicious`);

	console.log(`\n${'='.repeat(108)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(108)}`);
	await prisma.$disconnect();
	if (fail) process.exit(1);
}

main().catch(async (e) => {
	console.error('ERROR:', e.message);
	await prisma.$disconnect();
	process.exit(1);
});
