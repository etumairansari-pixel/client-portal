import { prisma } from '~~/server/utils/prisma';
import { getSessionUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
	const user = await getSessionUser(event);
	if (!user) return { user: null };

	const organization = user.organizationId
		? await prisma.organization.findUnique({
				where: { id: user.organizationId },
				select: { id: true, name: true, status: true },
			})
		: null;

	return { user, organization };
});
