import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient for the whole server runtime.
 *
 * Nuxt's dev server reloads modules on every change; without this global cache
 * each reload would open a new connection pool and exhaust Atlas connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
	});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
