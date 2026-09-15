import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * File storage boundary.
 *
 * Business logic only ever sees an opaque `storageKey`. Swapping local disk for
 * S3-compatible object storage later means reimplementing this file and nothing
 * else — no Scope code changes.
 *
 * Nothing here is publicly served: bytes are only returned through an
 * authorised API route, so there are no guessable public URLs.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_MIME = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'application/pdf',
	'text/plain',
	'text/csv',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/zip',
]);

export interface StoredFile {
	storageKey: string;
	sizeBytes: number;
}

export interface StorageDriver {
	put(data: Buffer, opts: { organizationId: string }): Promise<StoredFile>;
	get(storageKey: string): Promise<Buffer>;
	remove(storageKey: string): Promise<void>;
}

const ROOT = resolve(process.env.STORAGE_ROOT ?? '.data/uploads');

/** Reject anything that could escape the storage root. */
function safePath(storageKey: string) {
	if (!/^[A-Za-z0-9/_-]+$/.test(storageKey)) throw new Error('Invalid storage key');
	const full = resolve(join(ROOT, storageKey));
	if (!full.startsWith(ROOT)) throw new Error('Invalid storage key');
	return full;
}

const localDriver: StorageDriver = {
	async put(data, { organizationId }) {
		// Random name — never derived from the original filename, so uploads are
		// not guessable and cannot collide.
		const storageKey = `${organizationId}/${randomBytes(24).toString('hex')}`;
		const full = safePath(storageKey);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, data);
		return { storageKey, sizeBytes: data.byteLength };
	},

	async get(storageKey) {
		return readFile(safePath(storageKey));
	},

	async remove(storageKey) {
		await unlink(safePath(storageKey)).catch(() => undefined);
	},
};

export const storage: StorageDriver = localDriver;

export function validateUpload(mimeType: string, sizeBytes: number) {
	if (!ALLOWED_MIME.has(mimeType)) {
		throw createError({ statusCode: 400, statusMessage: `Files of type ${mimeType} are not accepted` });
	}
	if (sizeBytes > MAX_FILE_BYTES) {
		throw createError({ statusCode: 400, statusMessage: `Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller` });
	}
}
