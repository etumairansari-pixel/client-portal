import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { assertStorageKey, newStorageKey, type StorageDriver } from './types.ts';

/**
 * Local-disk driver. Fine for development and for hosts with a persistent
 * volume; not for hosts that rebuild the filesystem on deploy.
 */
export function createLocalStorageDriver(root: string): StorageDriver {
	const ROOT = resolve(root);

	/** Reject anything that could escape the storage root. */
	function safePath(storageKey: string) {
		assertStorageKey(storageKey);
		const full = resolve(join(ROOT, storageKey));
		if (full !== ROOT && !full.startsWith(ROOT + sep)) throw new Error('Invalid storage key');
		return full;
	}

	return {
		name: 'local',
		async put(data, { organizationId }) {
			const storageKey = newStorageKey(organizationId, randomBytes(24).toString('hex'));
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
}
