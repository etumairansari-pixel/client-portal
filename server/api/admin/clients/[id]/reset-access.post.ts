import { prisma } from '~~/server/utils/prisma';
import { requireOwner } from '~~/server/utils/auth';
import { resetClientAccess } from '~~/server/services/clients';
import { enforceRateLimit } from '~~/server/utils/rate-limit-h3';

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	enforceRateLimit(event, 'clientCreatePerOwner', owner.id);
	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing client id' });

	// Reset the primary CLIENT user of this organization.
	const user = await prisma.user.findFirst({
		where: { organizationId: id, role: 'CLIENT' },
		orderBy: { createdAt: 'asc' },
	});
	if (!user) throw createError({ statusCode: 404, statusMessage: 'No client user for this organization' });

	const { invitation } = await resetClientAccess(event, owner.id, user.id);
	return { email: user.email, invitation };
});
