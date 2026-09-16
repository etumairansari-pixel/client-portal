import { z } from 'zod';
import { requireOwner } from '~~/server/utils/auth';
import { createClient } from '~~/server/services/clients';
import { enforceRateLimit } from '~~/server/utils/rate-limit-h3';

const schema = z.object({
	organizationName: z.string().min(1, 'Company name is required'),
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().min(1, 'Last name is required'),
	email: z.string().email('A valid email is required'),
	phone: z.string().optional().nullable(),
	website: z.string().optional().nullable(),
});

export default defineEventHandler(async (event) => {
	const owner = await requireOwner(event);
	enforceRateLimit(event, 'clientCreatePerOwner', owner.id);

	const body = await readValidatedBody(event, schema.safeParse);
	if (!body.success) {
		throw createError({
			statusCode: 400,
			statusMessage: body.error.issues[0]?.message ?? 'Invalid client details',
		});
	}

	const { organization, user, invitation } = await createClient(event, owner.id, body.data);

	// No credential is ever returned. `invitation.setupLink` is present only
	// when mail is not configured, so the Owner can pass the one-time link on.
	return {
		organization: { id: organization.id, name: organization.name, status: organization.status },
		user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
		invitation,
	};
});
