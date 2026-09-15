import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);

	const [totalClients, activeClients, activeProjects, organizations] = await Promise.all([
		prisma.organization.count(),
		prisma.organization.count({ where: { status: 'ACTIVE' } }),
		prisma.project.count({ where: { status: 'ACTIVE' } }),
		prisma.organization.findMany({ select: { id: true, _count: { select: { projects: true } } } }),
	]);

	// A client with no project yet still needs setting up.
	const awaitingSetup = organizations.filter((o) => o._count.projects === 0).length;

	const recentClients = await prisma.organization.findMany({
		orderBy: { createdAt: 'desc' },
		take: 5,
		select: { id: true, name: true, status: true, createdAt: true, _count: { select: { projects: true } } },
	});

	return { stats: { totalClients, activeClients, activeProjects, awaitingSetup }, recentClients };
});
