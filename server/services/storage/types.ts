export interface StoredFile {
	storageKey: string;
	sizeBytes: number;
}

/**
 * Storage boundary. Business logic only ever sees an opaque `storageKey`;
 * where the bytes live is an infrastructure decision made once, from config.
 *
 * Nothing behind this interface is publicly reachable: bytes only leave the
 * system through an authorised API route, so there are no guessable URLs.
 */
export interface StorageDriver {
	readonly name: string;
	put(data: Buffer, opts: { organizationId: string }): Promise<StoredFile>;
	get(storageKey: string): Promise<Buffer>;
	remove(storageKey: string): Promise<void>;
}

/** Random, tenant-prefixed, never derived from the original filename. */
export function newStorageKey(organizationId: string, random: string): string {
	if (!/^[A-Za-z0-9]+$/.test(organizationId)) throw new Error('Invalid organization id');
	return `${organizationId}/${random}`;
}

/** Storage keys are strictly [A-Za-z0-9/_-] — no dots, so no traversal. */
export function assertStorageKey(storageKey: string): void {
	if (!/^[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/.test(storageKey)) throw new Error('Invalid storage key');
}
