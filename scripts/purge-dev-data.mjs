/**
 * Remove development / demo records so a database can be promoted to
 * production, or cleaned after test runs.
 *
 *   pnpm purge:dev-data            # dry run: lists what would be deleted
 *   pnpm purge:dev-data --confirm  # actually deletes
 *
 * Only records matching the known dev fixtures are touched: the seeded owner,
 * Client A / Client B / Matrix Test Co organisations, matrix+*@example.com
 * users, and everything that belongs to those organisations. Real data is
 * never matched. Refuses to run with NODE_ENV=production unless
 * ALLOW_DEV_DATA=1 is set explicitly.
 */
import { PrismaClient } from '@prisma/client';
import { DEV_ORGANIZATION_NAMES, DEV_EMAIL_PATTERNS, assertNotProduction } from './lib/dev-fixtures.mjs';

assertNotProduction('purge:dev-data');
const confirm = process.argv.includes('--confirm');
const prisma = new PrismaClient();

const matchesEmail = (email) => DEV_EMAIL_PATTERNS.some((p) => (p instanceof RegExp ? p.test(email) : p === email));

try {
	const orgs = await prisma.organization.findMany({
		where: { name: { in: DEV_ORGANIZATION_NAMES } },
		select: { id: true, name: true },
	});
	const orgIds = orgs.map((o) => o.id);
	const users = (await prisma.user.findMany({ select: { id: true, email: true, organizationId: true } })).filter(
		(u) => matchesEmail(u.email) || (u.organizationId && orgIds.includes(u.organizationId)),
	);
	const userIds = users.map((u) => u.id);

	const byOrg = { organizationId: { in: orgIds } };
	const counts = {
		organizations: orgs.length,
		users: users.length,
		projects: await prisma.project.count({ where: byOrg }),
		scopes: await prisma.scope.count({ where: byOrg }),
		srsDocuments: await prisma.srsDocument.count({ where: byOrg }),
		milestones: await prisma.milestone.count({ where: byOrg }),
		tasks: await prisma.projectTask.count({ where: byOrg }),
		updates: await prisma.projectUpdate.count({ where: byOrg }),
		changeRequests: await prisma.changeRequest.count({ where: byOrg }),
		notifications: await prisma.notification.count({ where: { OR: [byOrg, { userId: { in: userIds } }] } }),
		sessions: await prisma.session.count({ where: { userId: { in: userIds } } }),
		resetTokens: await prisma.passwordResetToken.count({ where: { userId: { in: userIds } } }),
		auditLogs: await prisma.auditLog.count({ where: { actorUserId: { in: userIds } } }),
	};

	console.log(confirm ? 'Deleting development data:' : 'Dry run - would delete:');
	for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(16)} ${v}`);
	for (const o of orgs) console.log(`  org   ${o.name}`);
	for (const u of users) console.log(`  user  ${u.email}`);

	if (!confirm) {
		console.log('\nRe-run with --confirm to delete.');
	} else {
		const ids = (rows) => rows.map((r) => r.id);
		// Children first; Mongo has no cascading deletes.
		const crIds = ids(await prisma.changeRequest.findMany({ where: byOrg, select: { id: true } }));
		await prisma.changeRequestMessage.deleteMany({ where: { changeRequestId: { in: crIds } } });
		await prisma.changeRequestAttachment.deleteMany({ where: { changeRequestId: { in: crIds } } });
		await prisma.changeRequest.deleteMany({ where: byOrg });
		await prisma.projectUpdate.deleteMany({ where: byOrg });
		await prisma.projectTask.deleteMany({ where: byOrg });
		await prisma.milestone.deleteMany({ where: byOrg });

		const srsIds = ids(await prisma.srsDocument.findMany({ where: byOrg, select: { id: true } }));
		const discIds = ids(
			await prisma.requirementDiscussion.findMany({ where: { srsDocumentId: { in: srsIds } }, select: { id: true } }),
		);
		await prisma.requirementMessage.deleteMany({ where: { discussionId: { in: discIds } } });
		await prisma.requirementDiscussion.deleteMany({ where: { id: { in: discIds } } });
		await prisma.requirementApproval.deleteMany({ where: { srsDocumentId: { in: srsIds } } });
		await prisma.srsAttachment.deleteMany({ where: { srsDocumentId: { in: srsIds } } });
		await prisma.srsRequirement.deleteMany({ where: { srsDocumentId: { in: srsIds } } });
		await prisma.srsVersion.deleteMany({ where: { srsDocumentId: { in: srsIds } } });
		await prisma.srsDocument.deleteMany({ where: byOrg });

		const scopeIds = ids(await prisma.scope.findMany({ where: byOrg, select: { id: true } }));
		const sdIds = ids(await prisma.scopeDiscussion.findMany({ where: { scopeId: { in: scopeIds } }, select: { id: true } }));
		await prisma.scopeMessage.deleteMany({ where: { discussionId: { in: sdIds } } });
		await prisma.scopeDiscussion.deleteMany({ where: { id: { in: sdIds } } });
		await prisma.scopeApproval.deleteMany({ where: { scopeId: { in: scopeIds } } });
		await prisma.scopeFile.deleteMany({ where: { scopeId: { in: scopeIds } } });
		await prisma.scopeVersion.deleteMany({ where: { scopeId: { in: scopeIds } } });
		await prisma.scope.deleteMany({ where: byOrg });

		await prisma.project.deleteMany({ where: byOrg });
		await prisma.notification.deleteMany({ where: { OR: [byOrg, { userId: { in: userIds } }] } });
		await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
		await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
		console.log('\nDone. Uploaded files for these organisations under the storage root can be removed separately.');
	}
} finally {
	await prisma.$disconnect();
}
