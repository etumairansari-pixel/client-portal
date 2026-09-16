/**
 * Phase 5 delivery workspace matrix: milestones, weighted progress, tasks,
 * internal visibility, updates, change requests, discussions, attachments,
 * notifications, tenant isolation, field tampering, employee privacy.
 * Drives the real HTTP API with cookie sessions, exactly as a browser would.
 */
import { PrismaClient } from '@prisma/client';
import { OWNER, CLIENT_A, CLIENT_B } from './lib/dev-fixtures.mjs';
import { weightedProgress, nextMilestone } from '../shared/delivery.ts';

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
	if (ok) pass++;
	else fail++;
	console.log(`  ${ok ? 'PASS' : '*** FAIL ***'}  ${label.padEnd(62)} ${detail}`);
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
	if (!r.ok) throw new Error(`login failed ${email}: ${r.status}`);
	return { j, user: r.data.user };
}
function pdf(name = 'brief.pdf') {
	const fd = new FormData();
	fd.append('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), name);
	return fd;
}
const FORBIDDEN_KEYS =
	/"(employeeId|assigneeId|assigneeName|assignee|createdByName|ownerName|internalNotes|authorUserId|createdById|postedById|uploadedById|actorUserId|email)"\s*:/;

const prisma = new PrismaClient();
const hr = (t) => console.log(`\n${'='.repeat(110)}\n${t}\n${'='.repeat(110)}`);

async function main() {
	console.log('BASE:', BASE);

	// clean slate
	await prisma.changeRequestMessage.deleteMany({});
	await prisma.changeRequestAttachment.deleteMany({});
	await prisma.changeRequest.deleteMany({});
	await prisma.projectUpdate.deleteMany({});
	await prisma.projectTask.deleteMany({});
	await prisma.milestone.deleteMany({});
	await prisma.notification.deleteMany({});

	const orgA = await prisma.organization.findFirst({ where: { name: CLIENT_A.organizationName } });
	const orgB = await prisma.organization.findFirst({ where: { name: CLIENT_B.organizationName } });
	const projA = await prisma.project.findFirst({ where: { organizationId: orgA.id } });
	const projB = await prisma.project.findFirst({ where: { organizationId: orgB.id } });
	await prisma.project.update({
		where: { id: projA.id },
		data: { currentStage: 'PLANNING', health: 'ON_TRACK', healthReason: null },
	});

	// ------------------------------------------------ pure formula
	hr('WEIGHTED PROGRESS FORMULA (unit)');
	check(
		'spec example 100x20 + 50x40 + 25x40 = 50%',
		weightedProgress([
			{ progressPercentage: 100, weight: 20 },
			{ progressPercentage: 50, weight: 40 },
			{ progressPercentage: 25, weight: 40 },
		]) === 50,
		'',
	);
	check('no milestones → null (Not available yet)', weightedProgress([]) === null, '');
	check(
		'zero/negative weights ignored',
		weightedProgress([
			{ progressPercentage: 100, weight: 0 },
			{ progressPercentage: 40, weight: -5 },
			{ progressPercentage: 20, weight: 10 },
		]) === 20,
		'',
	);
	check('all weights invalid → null', weightedProgress([{ progressPercentage: 100, weight: 0 }]) === null, '');
	check(
		'all completed → 100',
		weightedProgress([
			{ progressPercentage: 100, weight: 3 },
			{ progressPercentage: 100, weight: 7 },
		]) === 100,
		'',
	);
	check(
		'doc example (design 100/20, fe 70/25, be 60/30, qa 10/15, dep 0/10) = 57',
		weightedProgress([
			{ progressPercentage: 100, weight: 20 },
			{ progressPercentage: 70, weight: 25 },
			{ progressPercentage: 60, weight: 30 },
			{ progressPercentage: 10, weight: 15 },
			{ progressPercentage: 0, weight: 10 },
		]) === 57,
		'',
	);
	check(
		'out-of-range progress clamped',
		weightedProgress([
			{ progressPercentage: 250, weight: 1 },
			{ progressPercentage: -50, weight: 1 },
		]) === 50,
		'',
	);
	const nm = nextMilestone([
		{ id: 'a', status: 'COMPLETED', clientVisible: true, dueDate: '2026-01-01', sortOrder: 0 },
		{ id: 'b', status: 'IN_PROGRESS', clientVisible: false, dueDate: '2026-02-01', sortOrder: 1 },
		{ id: 'c', status: 'NOT_STARTED', clientVisible: true, dueDate: '2026-03-01', sortOrder: 2 },
		{ id: 'd', status: 'IN_PROGRESS', clientVisible: true, dueDate: null, sortOrder: 3 },
	]);
	check('next milestone skips completed + internal, picks nearest due', nm?.id === 'c', nm?.id);
	check('next milestone none → null', nextMilestone([]) === null, '');

	// ------------------------------------------------ unauthenticated
	hr('UNAUTHENTICATED');
	const anon = jar();
	for (const [label, path, opts] of [
		[
			'POST milestones',
			`/api/admin/projects/${projA.id}/milestones`,
			{ method: 'POST', body: { title: 'x', weight: 1 } },
		],
		['POST tasks', `/api/admin/projects/${projA.id}/tasks`, { method: 'POST', body: { title: 'x' } }],
		['POST updates', `/api/admin/projects/${projA.id}/updates`, { method: 'POST', body: { title: 'x', message: 'y' } }],
		['GET admin change-requests', '/api/admin/change-requests', {}],
		[
			'POST client change request',
			`/api/portal/projects/${projA.id}/change-requests`,
			{ method: 'POST', body: { type: 'BUG', title: 'x', description: 'y' } },
		],
		['GET client workspace', `/api/portal/projects/${projA.id}/workspace`, {}],
		['GET cr attachment', '/api/cr-attachments/000000000000000000000000', {}],
	]) {
		const r = await call(anon, path, opts);
		check(label + ' → 401', r.status === 401, `HTTP ${r.status}`);
	}

	const O = await login(OWNER.email, OWNER.password);
	const A = await login(CLIENT_A.email, CLIENT_A.password);
	const B = await login(CLIENT_B.email, CLIENT_B.password);

	hr('ROLE BOUNDARIES');
	let r = await call(A.j, `/api/admin/projects/${projA.id}/milestones`, {
		method: 'POST',
		body: { title: 'x', weight: 1 },
	});
	check('client → owner milestone route → 403', r.status === 403, `HTTP ${r.status}`);
	r = await call(A.j, `/api/admin/projects/${projA.id}`, { method: 'PATCH', body: { currentStage: 'COMPLETED' } });
	check('client → project PATCH (stage) → 403', r.status === 403, `HTTP ${r.status}`);
	r = await call(A.j, '/api/admin/change-requests', {});
	check('client → owner CR inbox → 403', r.status === 403, `HTTP ${r.status}`);
	r = await call(O.j, `/api/portal/projects/${projA.id}/change-requests`, {
		method: 'POST',
		body: { type: 'BUG', title: 'x', description: 'y' },
	});
	check('owner → client CR route → 403', r.status === 403, `HTTP ${r.status}`);

	// ------------------------------------------------ milestones
	hr('OWNER — MILESTONES');
	const mk = (body) => call(O.j, `/api/admin/projects/${projA.id}/milestones`, { method: 'POST', body });
	r = await mk({ title: '', weight: 10 });
	check('empty title rejected', r.status === 400, `HTTP ${r.status}`);
	r = await mk({ title: 'Bad', weight: 0 });
	check('weight 0 rejected', r.status === 400, `HTTP ${r.status}`);
	r = await mk({ title: 'Bad', weight: 10, progressPercentage: 120 });
	check('progress > 100 rejected', r.status === 400, `HTTP ${r.status}`);
	r = await mk({ title: 'Bad', weight: 10, progressPercentage: -1 });
	check('progress < 0 rejected', r.status === 400, `HTTP ${r.status}`);
	r = await mk({ title: 'Bad', weight: 10, status: 'BLOCKED' });
	check('BLOCKED without reason rejected', r.status === 400, `HTTP ${r.status}`);
	r = await mk({ title: 'Bad', weight: 10, startDate: '2026-10-10', dueDate: '2026-10-01' });
	check('due before start rejected', r.status === 400, `HTTP ${r.status}`);

	r = await mk({
		title: 'UI/UX Design',
		weight: 20,
		status: 'COMPLETED',
		progressPercentage: 30,
		dueDate: '2026-09-30',
	});
	const m1 = r.data?.milestone;
	check('M1 created', r.ok && !!m1?.id, m1?.title);
	check('COMPLETED forces progress 100', m1?.progressPercentage === 100, `${m1?.progressPercentage}%`);
	check('milestone bound to org A', m1?.organizationId === orgA.id, 'ok');

	r = await mk({
		title: 'Backend Development',
		weight: 40,
		status: 'IN_PROGRESS',
		progressPercentage: 50,
		dueDate: '2026-10-10',
		clientVisible: true,
	});
	const m2 = r.data?.milestone;
	check('M2 created (50%, w40)', r.ok && m2?.progressPercentage === 50, '');
	r = await mk({
		title: 'Internal Refactor',
		weight: 40,
		status: 'IN_PROGRESS',
		progressPercentage: 25,
		dueDate: '2026-10-05',
		clientVisible: false,
	});
	const m3 = r.data?.milestone;
	check('M3 created INTERNAL (25%, w40)', r.ok && m3?.clientVisible === false, '');
	r = await mk({ title: 'QA', weight: 10, status: 'NOT_STARTED', progressPercentage: 40 });
	const m4 = r.data?.milestone;
	check('NOT_STARTED forces progress 0', m4?.progressPercentage === 0, `${m4?.progressPercentage}%`);

	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	// (100*20 + 50*40 + 25*40 + 0*10) / 110 = 5000/110 = 45.45 → 45
	check(
		'owner overall progress = 45 (all milestones incl. internal)',
		r.data?.overallProgress === 45,
		`${r.data?.overallProgress}%`,
	);
	check(
		'owner next milestone = Backend (nearest due, client-visible)',
		r.data?.nextMilestone?.title === 'Backend Development',
		r.data?.nextMilestone?.title,
	);
	check('owner counts', r.data?.counts?.completed === 1 && r.data?.counts?.total === 4, JSON.stringify(r.data?.counts));

	r = await call(O.j, `/api/admin/projects/${projA.id}/milestones/reorder`, {
		method: 'POST',
		body: { orderedIds: [m4.id, m3.id, m2.id, m1.id, '000000000000000000000000'] },
	});
	check('reorder accepted (unknown ids ignored)', r.ok, '');
	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	check(
		'reorder persisted',
		r.data.milestones.map((m) => m.id).join(',') === [m4.id, m3.id, m2.id, m1.id].join(','),
		'',
	);

	r = await mk({
		milestoneId: m2.id,
		title: 'Backend Development',
		weight: 40,
		status: 'IN_PROGRESS',
		progressPercentage: 80,
	});
	check('edit progress → recalculated', r.ok, '');
	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	// (2000 + 3200 + 1000 + 0)/110 = 56.36 → 56
	check('overall progress recalculated = 56', r.data?.overallProgress === 56, `${r.data?.overallProgress}%`);

	r = await call(O.j, `/api/admin/projects/${projB.id}/milestones`, {
		method: 'POST',
		body: { milestoneId: m2.id, title: 'Hijack', weight: 1 },
	});
	check('editing milestone via wrong project → 404', r.status === 404, `HTTP ${r.status}`);

	// ------------------------------------------------ stage / health
	hr('OWNER — STAGE + HEALTH');
	r = await call(O.j, `/api/admin/projects/${projA.id}`, {
		method: 'PATCH',
		body: { currentStage: 'DEVELOPMENT', health: 'AT_RISK', healthReason: 'Third-party API delays.' },
	});
	check(
		'owner sets stage + health',
		r.ok && r.data.project.currentStage === 'DEVELOPMENT' && r.data.project.health === 'AT_RISK',
		'',
	);
	r = await call(O.j, `/api/admin/projects/${projA.id}`, { method: 'PATCH', body: { health: 'NOT_A_HEALTH' } });
	check('invalid health rejected', r.status === 400, `HTTP ${r.status}`);
	const pA = await prisma.project.findUnique({ where: { id: projA.id } });
	check(
		'stage NOT auto-derived from progress (still DEVELOPMENT at 56%)',
		pA.currentStage === 'DEVELOPMENT',
		pA.currentStage,
	);

	// ------------------------------------------------ tasks
	hr('OWNER — TASKS');
	const tk = (body) => call(O.j, `/api/admin/projects/${projA.id}/tasks`, { method: 'POST', body });
	r = await tk({
		title: 'Catalogue API',
		functionalTeam: 'DEVELOPMENT',
		status: 'IN_PROGRESS',
		progressPercentage: 70,
		clientVisible: true,
		milestoneId: m2.id,
		dueDate: '2026-10-08',
	});
	const t1 = r.data?.task;
	check('client-visible task created', r.ok && t1?.clientVisible === true, t1?.title);
	r = await tk({
		title: 'Refactor auth middleware (internal notes: talk to Rana)',
		functionalTeam: 'DEVELOPMENT',
		status: 'IN_PROGRESS',
		progressPercentage: 20,
		clientVisible: false,
		description: 'Assigned to Rana Abdul Rehman',
	});
	const t2 = r.data?.task;
	check('internal task created', r.ok && t2?.clientVisible === false, '');
	r = await tk({
		title: 'QA Testing',
		functionalTeam: 'QA',
		status: 'TODO',
		progressPercentage: 50,
		clientVisible: true,
	});
	check('TODO forces progress 0', r.data?.task?.progressPercentage === 0, `${r.data?.task?.progressPercentage}%`);
	r = await tk({ title: 'Blocked thing', status: 'BLOCKED' });
	check('BLOCKED task without reason rejected', r.status === 400, `HTTP ${r.status}`);
	r = await tk({ title: 'Wrong milestone', milestoneId: '000000000000000000000000' });
	check('task with foreign milestone rejected', r.status === 400, `HTTP ${r.status}`);
	r = await tk({
		taskId: t1.id,
		title: 'Catalogue API',
		status: 'COMPLETED',
		clientVisible: true,
		functionalTeam: 'DEVELOPMENT',
	});
	check('task completed → progress 100', r.ok && r.data.task.progressPercentage === 100, '');
	r = await tk({
		taskId: t1.id,
		title: 'Catalogue API',
		status: 'IN_PROGRESS',
		progressPercentage: 70,
		clientVisible: true,
		functionalTeam: 'DEVELOPMENT',
		milestoneId: m2.id,
	});
	check('task reopened', r.ok && r.data.task.status === 'IN_PROGRESS', '');

	// ------------------------------------------------ updates
	hr('OWNER — UPDATES');
	r = await call(O.j, `/api/admin/projects/${projA.id}/updates`, {
		method: 'POST',
		body: {
			title: 'Development Update',
			message: 'Authentication complete. Catalogue API under development.',
			milestoneId: m2.id,
			clientVisible: true,
		},
	});
	check('client-visible update posted', r.ok && r.data.update.clientVisible === true, '');
	r = await call(O.j, `/api/admin/projects/${projA.id}/updates`, {
		method: 'POST',
		body: { title: 'Internal standup', message: 'Rana is on leave Friday.', clientVisible: false },
	});
	check('internal update posted', r.ok && r.data.update.clientVisible === false, '');
	r = await call(O.j, `/api/admin/projects/${projA.id}/updates`, { method: 'POST', body: { title: '', message: '' } });
	check('empty update rejected', r.status === 400, `HTTP ${r.status}`);

	// ------------------------------------------------ client workspace
	hr('CLIENT A — WORKSPACE VISIBILITY');
	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	const ws = r.data;
	const wsJson = JSON.stringify(ws);
	check('client workspace loads', r.ok, `HTTP ${r.status}`);
	check('client sees SAME overall progress (56)', ws?.overallProgress === 56, `${ws?.overallProgress}%`);
	check(
		'client sees stage + health + reason',
		ws?.project?.currentStage === 'DEVELOPMENT' &&
			ws?.project?.health === 'AT_RISK' &&
			ws?.project?.healthReason?.includes('Third-party'),
		'',
	);
	check(
		'client next milestone = Backend',
		ws?.nextMilestone?.title === 'Backend Development',
		ws?.nextMilestone?.title,
	);
	check(
		'client sees only client-visible milestones (3 of 4)',
		ws?.milestones?.length === 3 && !ws.milestones.some((m) => m.id === m3.id),
		`${ws?.milestones?.length}`,
	);
	check(
		'client milestone has no weight/clientVisible/org fields',
		ws?.milestones?.every((m) => !('weight' in m) && !('organizationId' in m) && !('clientVisible' in m)),
		'',
	);
	check(
		'client sees only client-visible tasks (2 of 3)',
		ws?.tasks?.length === 2 && !ws.tasks.some((t) => t.id === t2.id),
		`${ws?.tasks?.length}`,
	);
	check(
		'client task has no description/priority/org fields',
		ws?.tasks?.every((t) => !('description' in t) && !('priority' in t) && !('organizationId' in t)),
		'',
	);
	check(
		'client task carries functional team, not a person',
		ws?.tasks?.[0]?.functionalTeam === 'DEVELOPMENT',
		ws?.tasks?.[0]?.functionalTeam,
	);
	check(
		'client sees only client-visible updates (1 of 2)',
		ws?.updates?.length === 1 && ws.updates[0].title === 'Development Update',
		`${ws?.updates?.length}`,
	);
	check(
		'internal text never appears in client payload',
		!wsJson.includes('Rana') && !wsJson.includes('standup') && !wsJson.includes('Refactor'),
		'',
	);
	check(
		'client payload has no forbidden identity keys',
		!FORBIDDEN_KEYS.test(wsJson),
		(wsJson.match(FORBIDDEN_KEYS) || [''])[0],
	);
	check('client payload has no owner user id', !wsJson.includes(O.user.id), '');
	check('client payload has no audit metadata', !('activity' in (ws ?? {})), '');
	check('client sees no ip / audit keys', !/"ip"\s*:|"metadata"\s*:/.test(wsJson), '');

	r = await call(B.j, `/api/portal/projects/${projA.id}/workspace`);
	check("client B cannot open A's workspace (exact id)", r.status === 404, `HTTP ${r.status}`);
	r = await call(A.j, `/api/portal/projects/${projB.id}/workspace`);
	check("client A cannot open B's workspace (exact id)", r.status === 404, `HTTP ${r.status}`);

	// ------------------------------------------------ change requests
	hr('CLIENT A — CHANGE REQUESTS');
	r = await call(A.j, `/api/portal/projects/${projA.id}/change-requests`, {
		method: 'POST',
		body: {
			type: 'NEW_FEATURE',
			title: 'CSV export',
			description: 'Please add CSV export.',
			priority: 'HIGH',
			relatedMilestoneId: m2.id,
			// tampering attempts - must be ignored or rejected
			status: 'COMPLETED',
			organizationId: orgB.id,
			resolvedAt: '2020-01-01',
			createdById: O.user.id,
			projectId: projB.id,
		},
	});
	const cr = r.data?.changeRequest;
	check('client submits change request', r.ok && !!cr?.id, cr?.title);
	check('status forced to SUBMITTED (tamper ignored)', cr?.status === 'SUBMITTED', cr?.status);
	const crDb = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
	check('DB: organizationId from session, not body', crDb.organizationId === orgA.id, '');
	check('DB: projectId from route, not body', crDb.projectId === projA.id, '');
	check('DB: resolvedAt null (tamper ignored)', crDb.resolvedAt === null, '');
	check('DB: createdById is client, not body value', crDb.createdById === A.user.id, '');
	check('response has no createdById', !('createdById' in cr), '');

	r = await call(A.j, `/api/portal/projects/${projA.id}/change-requests`, {
		method: 'POST',
		body: { type: 'NEW_FEATURE', title: 'x', description: 'y', relatedMilestoneId: m3.id },
	});
	check('client cannot reference an INTERNAL milestone', r.status === 400, `HTTP ${r.status}`);
	r = await call(A.j, `/api/portal/projects/${projA.id}/change-requests`, {
		method: 'POST',
		body: { type: 'HACK', title: 'x', description: 'y' },
	});
	check('invalid type rejected', r.status === 400, `HTTP ${r.status}`);
	r = await call(A.j, `/api/portal/projects/${projB.id}/change-requests`, {
		method: 'POST',
		body: { type: 'BUG', title: 'x', description: 'y' },
	});
	check("client A cannot raise CR on B's project", r.status === 404, `HTTP ${r.status}`);

	r = await call(A.j, `/api/portal/change-requests/${cr.id}/attachments`, { method: 'POST', raw: pdf() });
	const att = r.data?.attachment;
	check('client attaches a file', r.ok && !!att?.id, att?.originalName);
	r = await call(B.j, `/api/portal/change-requests/${cr.id}/attachments`, { method: 'POST', raw: pdf() });
	check("client B cannot attach to A's CR", r.status === 404, `HTTP ${r.status}`);
	r = await call(B.j, `/api/cr-attachments/${att.id}`);
	check("client B cannot download A's attachment", r.status === 404, `HTTP ${r.status}`);
	r = await call(A.j, `/api/cr-attachments/${att.id}`);
	check('client A downloads own attachment', r.status === 200, `HTTP ${r.status}`);
	r = await call(O.j, `/api/cr-attachments/${att.id}`);
	check('owner downloads attachment', r.status === 200, `HTTP ${r.status}`);

	// Client cannot move status through any route.
	r = await call(A.j, `/api/admin/change-requests/${cr.id}/transition`, { method: 'POST', body: { to: 'ACCEPTED' } });
	check('client → transition route → 403', r.status === 403, `HTTP ${r.status}`);

	hr('OWNER — CHANGE REQUEST WORKFLOW');
	const tr = (to, note) =>
		call(O.j, `/api/admin/change-requests/${cr.id}/transition`, { method: 'POST', body: { to, note } });
	r = await call(O.j, '/api/admin/change-requests');
	check(
		'owner inbox lists the request with client + project',
		r.ok &&
			r.data.changeRequests.some((c) => c.id === cr.id && c.organization?.name === 'Client A Ltd' && c.project?.name),
		'',
	);
	r = await tr('ACCEPTED');
	check('SUBMITTED → ACCEPTED refused (must review first)', r.status === 409, `HTTP ${r.status}`);
	r = await tr('COMPLETED');
	check('SUBMITTED → COMPLETED refused', r.status === 409, `HTTP ${r.status}`);
	r = await tr('UNDER_REVIEW');
	check('SUBMITTED → UNDER_REVIEW', r.ok && r.data.changeRequest.status === 'UNDER_REVIEW', '');
	r = await tr('CLARIFICATION_REQUIRED');
	check('clarification without message rejected', r.status === 400, `HTTP ${r.status}`);
	r = await tr('CLARIFICATION_REQUIRED', 'Which reports require export?');
	check(
		'UNDER_REVIEW → CLARIFICATION_REQUIRED (with question)',
		r.ok && r.data.changeRequest.status === 'CLARIFICATION_REQUIRED',
		'',
	);
	r = await tr('ACCEPTED');
	check('CLARIFICATION_REQUIRED → ACCEPTED refused', r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	check(
		'client sees action required: clarify',
		r.data?.actionsRequired?.some((a) => a.key === `cr-${cr.id}`),
		'',
	);
	check(
		'client sees Eiretech question in thread',
		r.data?.changeRequests?.[0]?.messages?.some((m) => m.authorSide === 'EIRETECH' && m.body.includes('Which reports')),
		'',
	);

	r = await call(B.j, `/api/portal/change-requests/${cr.id}/reply`, { method: 'POST', body: { body: 'hijack' } });
	check("client B cannot reply on A's CR", r.status === 404, `HTTP ${r.status}`);
	r = await call(A.j, `/api/portal/change-requests/${cr.id}/reply`, {
		method: 'POST',
		body: { body: 'Sales and Inventory.' },
	});
	check('client A replies to clarification', r.ok, '');
	const afterReply = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
	check('client reply returns request to UNDER_REVIEW', afterReply.status === 'UNDER_REVIEW', afterReply.status);

	r = await call(O.j, `/api/admin/change-requests/${cr.id}/reply`, { method: 'POST', body: { body: 'Confirmed.' } });
	check('owner replies', r.ok, '');
	r = await tr('DECLINED');
	check('decline without reason rejected', r.status === 400, `HTTP ${r.status}`);
	r = await tr('ACCEPTED', 'Scheduled for the next sprint.');
	check('UNDER_REVIEW → ACCEPTED', r.ok && r.data.changeRequest.status === 'ACCEPTED', '');
	r = await tr('COMPLETED');
	check('ACCEPTED → COMPLETED refused (must be in progress)', r.status === 409, `HTTP ${r.status}`);
	r = await tr('IN_PROGRESS');
	check('ACCEPTED → IN_PROGRESS', r.ok, '');
	r = await tr('COMPLETED', 'Export shipped in v1.2.');
	check(
		'IN_PROGRESS → COMPLETED',
		r.ok && r.data.changeRequest.status === 'COMPLETED' && !!r.data.changeRequest.resolvedAt,
		'',
	);
	r = await tr('UNDER_REVIEW');
	check('COMPLETED is terminal', r.status === 409, `HTTP ${r.status}`);
	r = await call(A.j, `/api/portal/change-requests/${cr.id}/reply`, { method: 'POST', body: { body: 'late' } });
	check('client cannot reply on closed CR', r.status === 409, `HTTP ${r.status}`);
	r = await call(A.j, `/api/portal/change-requests/${cr.id}/attachments`, { method: 'POST', raw: pdf('late.pdf') });
	check('client cannot attach to closed CR', r.status === 409, `HTTP ${r.status}`);

	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	const crJson = JSON.stringify(r.data?.changeRequests ?? []);
	const msgs = r.data?.changeRequests?.[0]?.messages ?? [];
	check('client thread shows both sides', msgs.length >= 4, `${msgs.length} messages`);
	check(
		'client thread has only EIRETECH/CLIENT labels',
		msgs.every((m) => ['EIRETECH', 'CLIENT'].includes(m.authorSide)),
		'',
	);
	check(
		'client CR payload has no identity keys',
		!FORBIDDEN_KEYS.test(crJson),
		(crJson.match(FORBIDDEN_KEYS) || [''])[0],
	);
	check('client sees resolution note', r.data?.changeRequests?.[0]?.resolutionNote?.includes('shipped'), '');
	check(
		'client action required cleared after completion',
		!r.data?.actionsRequired?.some((a) => a.key === `cr-${cr.id}`),
		'',
	);

	// ------------------------------------------------ field tampering (client)
	hr('FIELD TAMPERING (CLIENT)');
	const snapshot = async () => ({
		project: await prisma.project.findUnique({ where: { id: projA.id } }),
		milestone: await prisma.milestone.findUnique({ where: { id: m2.id } }),
		task: await prisma.projectTask.findUnique({ where: { id: t1.id } }),
	});
	const s0 = await snapshot();
	const tamper = [
		[
			'PATCH project stage/health/progress',
			`/api/admin/projects/${projA.id}`,
			{ method: 'PATCH', body: { currentStage: 'COMPLETED', health: 'ON_TRACK', overallProgress: 100 } },
		],
		[
			'POST milestone progress/status',
			`/api/admin/projects/${projA.id}/milestones`,
			{
				method: 'POST',
				body: {
					milestoneId: m2.id,
					title: 'x',
					weight: 1,
					progressPercentage: 100,
					status: 'COMPLETED',
					clientVisible: true,
				},
			},
		],
		['DELETE milestone', `/api/admin/projects/${projA.id}/milestones/${m2.id}`, { method: 'DELETE' }],
		[
			'POST task progress/status',
			`/api/admin/projects/${projA.id}/tasks`,
			{ method: 'POST', body: { taskId: t1.id, title: 'x', status: 'COMPLETED', progressPercentage: 100 } },
		],
		[
			'POST internal task made visible',
			`/api/admin/projects/${projA.id}/tasks`,
			{ method: 'POST', body: { taskId: t2.id, title: 'x', clientVisible: true } },
		],
		[
			'POST project update',
			`/api/admin/projects/${projA.id}/updates`,
			{ method: 'POST', body: { title: 'x', message: 'y' } },
		],
	];
	for (const [label, path, opts] of tamper) {
		const rr = await call(A.j, path, opts);
		check(`client ${label} → 403`, rr.status === 403, `HTTP ${rr.status}`);
	}
	const s1 = await snapshot();
	check(
		'DB: project unchanged after tampering',
		s1.project.currentStage === s0.project.currentStage && s1.project.health === s0.project.health,
		'',
	);
	check(
		'DB: milestone unchanged after tampering',
		s1.milestone.progressPercentage === s0.milestone.progressPercentage && s1.milestone.status === s0.milestone.status,
		'',
	);
	check(
		'DB: task unchanged after tampering',
		s1.task.progressPercentage === s0.task.progressPercentage && s1.task.status === s0.task.status,
		'',
	);
	const t2Db = await prisma.projectTask.findUnique({ where: { id: t2.id } });
	check('DB: internal task still internal', t2Db.clientVisible === false, '');
	r = await call(A.j, `/api/portal/change-requests/${cr.id}/reply`, {
		method: 'POST',
		body: { body: 'x', status: 'ACCEPTED', organizationId: orgB.id },
	});
	const crAfter = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
	check(
		'reply body with status/org fields cannot change them',
		crAfter.status === 'COMPLETED' && crAfter.organizationId === orgA.id,
		'',
	);

	// exact-id access to an internal task via every client surface
	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	check('internal task id absent from client workspace (exact id)', !JSON.stringify(r.data).includes(t2.id), '');
	check('internal milestone id absent from client workspace (exact id)', !JSON.stringify(r.data).includes(m3.id), '');

	// ------------------------------------------------ notifications
	hr('NOTIFICATIONS');
	const aNotes = await prisma.notification.findMany({ where: { userId: A.user.id }, orderBy: { createdAt: 'asc' } });
	const bNotes = await prisma.notification.findMany({ where: { userId: B.user.id } });
	const types = new Set(aNotes.map((n) => n.type));
	for (const t of [
		'MILESTONE_CREATED',
		'MILESTONE_UPDATED',
		'PROJECT_UPDATE_POSTED',
		'PROJECT_STAGE_CHANGED',
		'PROJECT_HEALTH_CHANGED',
		'CHANGE_REQUEST_UNDER_REVIEW',
		'CHANGE_REQUEST_CLARIFICATION_REQUIRED',
		'CHANGE_REQUEST_ACCEPTED',
		'CHANGE_REQUEST_IN_PROGRESS',
		'CHANGE_REQUEST_COMPLETED',
		'CHANGE_REQUEST_MESSAGE',
	]) {
		check(`client notified: ${t}`, types.has(t), '');
	}
	check('internal milestone did NOT notify client', !aNotes.some((n) => n.title.includes('Internal Refactor')), '');
	check('internal update did NOT notify client', !aNotes.some((n) => n.title.includes('standup')), '');
	check('client B received nothing', bNotes.length === 0, `${bNotes.length}`);
	check('notifications carry no employee names', !aNotes.some((n) => /Rana|owner@/i.test(`${n.title} ${n.body}`)), '');
	r = await call(O.j, '/api/notifications');
	check(
		'owner notified of CR submission + reply',
		r.data?.notifications?.some((n) => n.type === 'CHANGE_REQUEST_SUBMITTED') &&
			r.data.notifications.some((n) => n.type === 'CHANGE_REQUEST_MESSAGE'),
		'',
	);
	const firstA = aNotes[0];
	r = await call(B.j, `/api/notifications/${firstA.id}/read`, { method: 'POST' });
	const stillUnread = await prisma.notification.findUnique({ where: { id: firstA.id } });
	check("client B cannot mark A's notification read", stillUnread.readAt === null, '');
	r = await call(A.j, `/api/notifications/${firstA.id}/read`, { method: 'POST' });
	const nowRead = await prisma.notification.findUnique({ where: { id: firstA.id } });
	check('client A marks own notification read', r.ok && !!nowRead.readAt, '');
	r = await call(A.j, '/api/notifications');
	check('unread count reflects it', r.data.unread === aNotes.length - 1, `${r.data.unread}`);

	// ------------------------------------------------ audit + activity
	hr('AUDIT + ACTIVITY');
	const actions = new Set(
		(await prisma.auditLog.findMany({ take: 300, orderBy: { createdAt: 'desc' } })).map((a) => a.action),
	);
	for (const a of [
		'MILESTONE_CREATED',
		'MILESTONE_UPDATED',
		'MILESTONES_REORDERED',
		'PROJECT_TASK_CREATED',
		'PROJECT_TASK_UPDATED',
		'PROJECT_TASK_COMPLETED',
		'PROJECT_UPDATE_POSTED',
		'PROJECT_STAGE_CHANGED',
		'PROJECT_HEALTH_CHANGED',
		'CHANGE_REQUEST_CREATED',
		'CHANGE_REQUEST_REVIEW_STARTED',
		'CHANGE_REQUEST_CLARIFICATION_REQUESTED',
		'CHANGE_REQUEST_REPLIED',
		'CHANGE_REQUEST_ACCEPTED',
		'CHANGE_REQUEST_STARTED',
		'CHANGE_REQUEST_COMPLETED',
		'CHANGE_REQUEST_ATTACHMENT_UPLOADED',
	]) {
		check(`audit: ${a}`, actions.has(a), '');
	}
	const leaky = (await prisma.auditLog.findMany({ take: 300 })).filter((a) =>
		JSON.stringify(a.metadata ?? {}).match(/password|secret|token|storageKey/i),
	);
	check('no secrets in audit metadata', leaky.length === 0, `${leaky.length}`);
	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	check(
		'owner activity includes milestone/task/CR events',
		r.data.activity.some((a) => a.action === 'MILESTONE_CREATED') &&
			r.data.activity.some((a) => a.action === 'CHANGE_REQUEST_COMPLETED'),
		`${r.data.activity.length} entries`,
	);
	check(
		'owner files tab lists CR attachment',
		r.data.files.some((f) => f.id === att.id && f.url === `/api/cr-attachments/${att.id}`),
		'',
	);

	// milestone delete detaches, then progress recalculates
	r = await call(O.j, `/api/admin/projects/${projA.id}/milestones/${m3.id}`, { method: 'DELETE' });
	check('owner deletes internal milestone', r.ok, '');
	r = await call(O.j, `/api/admin/projects/${projA.id}`);
	// (2000 + 3200 + 0)/70 = 74.28 → 74
	check('progress recalculated after delete = 74', r.data.overallProgress === 74, `${r.data.overallProgress}%`);
	r = await call(A.j, `/api/portal/projects/${projA.id}/workspace`);
	check('client sees the same 74', r.data.overallProgress === 74, `${r.data.overallProgress}%`);

	console.log(`\n${'='.repeat(110)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(110)}`);
	await prisma.$disconnect();
	if (fail) process.exit(1);
}

main().catch(async (e) => {
	console.error('ERROR:', e.message);
	await prisma.$disconnect();
	process.exit(1);
});
