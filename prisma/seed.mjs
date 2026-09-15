/**
 * Local development seed.
 *
 * Creates one OWNER and two isolated CLIENT tenants used by the security
 * matrix. Passwords here are local throwaways — never reuse in production.
 *
 *   node prisma/seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const OWNER = { email: 'owner@eiretech360.com', password: 'OwnerLocal!2026' };
const CLIENT_A = { email: 'clienta@example.com', password: 'ClientALocal!2026' };
const CLIENT_B = { email: 'clientb@example.com', password: 'ClientBLocal!2026' };

async function upsertOwner() {
	const existing = await prisma.user.findUnique({ where: { email: OWNER.email } });
	if (existing) return existing;
	return prisma.user.create({
		data: {
			email: OWNER.email,
			passwordHash: await hash(OWNER.password),
			firstName: 'Eiretech',
			lastName: 'Owner',
			role: 'OWNER',
			status: 'ACTIVE',
		},
	});
}

async function upsertTenant({ orgName, email, password, firstName, projectName, stage }) {
	let org = await prisma.organization.findFirst({ where: { name: orgName } });
	if (!org) org = await prisma.organization.create({ data: { name: orgName, email, status: 'ACTIVE' } });

	let user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		user = await prisma.user.create({
			data: {
				email,
				passwordHash: await hash(password),
				firstName,
				lastName: 'Tester',
				role: 'CLIENT',
				status: 'ACTIVE',
				organizationId: org.id,
			},
		});
	}

	let project = await prisma.project.findFirst({ where: { organizationId: org.id, name: projectName } });
	if (!project) {
		project = await prisma.project.create({
			data: {
				organizationId: org.id,
				name: projectName,
				description: `${orgName} engagement.`,
				currentStage: stage,
				status: 'ACTIVE',
				targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
			},
		});
	}

	return { org, user, project };
}

const owner = await upsertOwner();
const a = await upsertTenant({
	orgName: 'Client A Ltd',
	email: CLIENT_A.email,
	password: CLIENT_A.password,
	firstName: 'ClientA',
	projectName: 'Project Alpha',
	stage: 'DEVELOPMENT',
});
const b = await upsertTenant({
	orgName: 'Client B Ltd',
	email: CLIENT_B.email,
	password: CLIENT_B.password,
	firstName: 'ClientB',
	projectName: 'Project Beta',
	stage: 'DESIGN',
});

console.log('OWNER   ', owner.email, owner.id);
console.log('CLIENT A', a.user.email, '| org', a.org.id, '| project', a.project.id);
console.log('CLIENT B', b.user.email, '| org', b.org.id, '| project', b.project.id);

await prisma.$disconnect();
