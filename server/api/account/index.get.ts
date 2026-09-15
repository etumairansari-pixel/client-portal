import { prisma } from '~~/server/utils/prisma';
import { requireUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	const session = await requireUser(event);

	const user = await prisma.user.findUnique({
		where: { id: session.id },
		select: {
			id: true, email: true, firstName: true, lastName: true, role: true,
			lastLoginAt: true, createdAt: true, mustChangePassword: true,
			organization: { select: { id: true, name: true } },
		},
	});

	return { user };
});
