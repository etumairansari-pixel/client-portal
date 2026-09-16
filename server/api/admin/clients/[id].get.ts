import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	await requireOwner(event);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing client id' });

	const organization = await prisma.organization.findUnique({
		where: { id },
		include: {
			users: {
				where: { role: 'CLIENT' },
				select: {
					id: true,
					email: true,
					firstName: true,
					lastName: true,
					status: true,
					lastLoginAt: true,
					mustChangePassword: true,
				},
			},
			projects: { orderBy: { createdAt: 'desc' } },
		},
	});

	if (!organization) throw createError({ statusCode: 404, statusMessage: 'Client not found' });
	return { organization };
});
