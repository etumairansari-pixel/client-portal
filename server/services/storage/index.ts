import { createError } from 'h3';
import { getEnv } from '../../utils/env.ts';
import { log } from '../../utils/log.ts';
import { createLocalStorageDriver } from './local.ts';
import { createS3StorageDriverFromConfig } from './s3.ts';
import { checkUpload, sanitizeFilename, contentDisposition, MAX_FILE_BYTES, ALLOWED_MIME } from './validate.ts';
import type { StorageDriver, StoredFile } from './types.ts';

export type { StorageDriver, StoredFile };
export { sanitizeFilename, contentDisposition, MAX_FILE_BYTES, ALLOWED_MIME };

let driver: StorageDriver | null = null;
let pending: Promise<StorageDriver> | null = null;

/** Driver chosen once from STORAGE_DRIVER. */
export async function getStorage(): Promise<StorageDriver> {
	if (driver) return driver;
	if (!pending) {
		pending = (async () => {
			const env = getEnv();
			const d =
				env.STORAGE_DRIVER === 's3'
					? await createS3StorageDriverFromConfig({
							bucket: env.S3_BUCKET!,
							region: env.S3_REGION,
							endpoint: env.S3_ENDPOINT,
							accessKeyId: env.S3_ACCESS_KEY!,
							secretAccessKey: env.S3_SECRET_KEY!,
							forcePathStyle: env.S3_FORCE_PATH_STYLE,
						})
					: createLocalStorageDriver(env.STORAGE_ROOT);
			log.info('storage', `driver: ${d.name}`);
			driver = d;
			return d;
		})();
	}
	return pending;
}

/** Test hook. */
export function setStorageDriver(d: StorageDriver | null) {
	driver = d;
	pending = null;
}

/**
 * Convenience facade so call sites read as before: `storage.put(...)`.
 * Each call resolves the configured driver lazily.
 */
export const storage: StorageDriver = {
	get name() {
		return driver?.name ?? 'unresolved';
	},
	put: async (data, opts) => (await getStorage()).put(data, opts),
	get: async (key) => (await getStorage()).get(key),
	remove: async (key) => (await getStorage()).remove(key),
};

export interface MultipartFile {
	filename?: string;
	type?: string;
	data: Buffer;
}

/**
 * Validate a multipart file part or throw 400. Returns the sanitised
 * filename and normalised MIME type to persist.
 */
export function validateUpload(part: MultipartFile): { originalName: string; mimeType: string } {
	const mimeType = (part.type ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
	const originalName = sanitizeFilename(part.filename);
	const reason = checkUpload({
		mimeType,
		sizeBytes: part.data.byteLength,
		filename: originalName,
		head: part.data.subarray(0, 16),
	});
	if (reason) throw createError({ statusCode: 400, statusMessage: reason });
	return { originalName, mimeType };
}
