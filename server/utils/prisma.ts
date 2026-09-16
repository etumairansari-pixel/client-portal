import { Prisma, PrismaClient } from '@prisma/client';
import { createError } from 'h3';

/**
 * Single PrismaClient for the whole server runtime.
 *
 * Nuxt's dev server reloads modules on every change; without this global cache
 * each reload would open a new connection pool and exhaust Atlas connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
	const client = new PrismaClient({
		log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
	});

	// A malformed ObjectId in a URL (`/api/.../not-an-id`) is a client mistake,
	// not a server fault: answer 404 like an unknown id instead of surfacing a
	// 500 whose details would then have to be hidden.
	return client.$extends({
		query: {
			async $allOperations({ args, query }) {
				try {
					return await query(args);
				} catch (error) {
					if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
						throw createError({ statusCode: 404, statusMessage: 'Not found' });
					}
					throw error;
				}
			},
		},
	}) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
