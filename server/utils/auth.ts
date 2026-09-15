import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { H3Event } from 'h3';
import type { Role, User } from '@prisma/client';
import { prisma } from './prisma';

export const SESSION_COOKIE = 'eiretech_session';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

// ----------------------------------------------------------------- passwords

/** Argon2id. Never store or log the plaintext. */
export function hashPassword(plain: string): Promise<string> {
	return argonHash(plain);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
	try {
		return await argonVerify(storedHash, plain);
	} catch {
		return false;
	}
}

/** Readable temporary password for the Owner to hand over once. */
export function generateTemporaryPassword(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
	const bytes = randomBytes(14);
	let out = '';
	for (const byte of bytes) out += alphabet[byte % alphabet.length];
	return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

// -------------------------------------------------------------------- tokens

/**
 * Only the hash of a token is ever persisted, so a database leak cannot be
 * replayed. The raw value exists solely in the cookie / reset link.
 */
export function hashToken(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

export function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Constant-time compare for anything secret-adjacent. */
export function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

// ------------------------------------------------------------------ sessions

export async function createSession(event: H3Event, user: User) {
	const raw = generateToken();

	await prisma.session.create({
		data: {
			tokenHash: hashToken(raw),
			userId: user.id,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
			userAgent: getRequestHeader(event, 'user-agent')?.slice(0, 255) ?? null,
			ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
		},
	});

	setCookie(event, SESSION_COOKIE, raw, {
		httpOnly: true, // never readable from JavaScript
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: SESSION_TTL_MS / 1000,
	});

	return raw;
}

export async function destroySession(event: H3Event) {
	const raw = getCookie(event, SESSION_COOKIE);
	if (raw) {
		await prisma.session
			.updateMany({ where: { tokenHash: hashToken(raw) }, data: { revokedAt: new Date() } })
			.catch(() => undefined);
	}
	deleteCookie(event, SESSION_COOKIE, { path: '/' });
}

export type SessionUser = Pick<
	User,
	'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'status' | 'organizationId' | 'mustChangePassword'
>;

/**
 * Resolve the caller from the session cookie. Returns null for anonymous,
 * expired, revoked or suspended users.
 */
export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
	const raw = getCookie(event, SESSION_COOKIE);
	if (!raw) return null;

	const session = await prisma.session.findUnique({
		where: { tokenHash: hashToken(raw) },
		include: { user: true },
	});

	if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
	// A suspended user loses access immediately, without waiting for expiry.
	if (!session.user || session.user.status !== 'ACTIVE') return null;

	const { id, email, firstName, lastName, role, status, organizationId, mustChangePassword } = session.user;
	return { id, email, firstName, lastName, role, status, organizationId, mustChangePassword };
}

/** Revoke every live session for a user (suspend, password reset, etc). */
export async function revokeAllSessions(userId: string) {
	await prisma.session.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
}

// --------------------------------------------------------------- route guards

export async function requireUser(event: H3Event): Promise<SessionUser> {
	const user = await getSessionUser(event);
	if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
	return user;
}

export async function requireRole(event: H3Event, role: Role): Promise<SessionUser> {
	const user = await requireUser(event);
	if (user.role !== role) throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
	// A temporary password grants nothing but the ability to replace it, so the
	// product APIs stay closed until the handover is finished. The dedicated
	// change-password route uses requireUser and is deliberately unaffected.
	if (user.mustChangePassword) {
		throw createError({ statusCode: 403, statusMessage: 'Please set your own password before continuing' });
	}
	return user;
}

export const requireOwner = (event: H3Event) => requireRole(event, 'OWNER');

/**
 * A CLIENT is always pinned to their own organization. The id is taken from the
 * session, never from the request, so changing an id in a URL cannot widen access.
 */
export async function requireClient(event: H3Event): Promise<SessionUser & { organizationId: string }> {
	const user = await requireRole(event, 'CLIENT');
	if (!user.organizationId) {
		throw createError({ statusCode: 403, statusMessage: 'Client account is not linked to an organization' });
	}
	return user as SessionUser & { organizationId: string };
}

// ------------------------------------------------------------- reset tokens

export async function createPasswordResetToken(userId: string) {
	const raw = generateToken();
	await prisma.passwordResetToken.create({
		data: { tokenHash: hashToken(raw), userId, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
	});
	return raw;
}

/** Validates expiry and single use, then marks the token spent. */
export async function consumePasswordResetToken(raw: string) {
	const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(raw) } });
	if (!token || token.usedAt || token.expiresAt < new Date()) return null;

	await prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
	return token;
}
