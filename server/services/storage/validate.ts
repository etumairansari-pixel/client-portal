/**
 * Upload validation. Pure functions: no I/O, no framework globals.
 *
 * Every upload passes through `checkUpload` before a byte is stored. The rules:
 *   - MIME type on an allow-list (no SVG/HTML — anything a browser could execute)
 *   - file extension must agree with the declared MIME type
 *   - leading bytes must look like the declared type where the format has a
 *     recognisable signature
 *   - hard size cap
 *   - the original filename is sanitised before it is stored or echoed back
 */

import { ALLOWED_TYPES, MAX_FILE_BYTES } from '../../../shared/uploads.ts';

export { ALLOWED_TYPES, MAX_FILE_BYTES };

export const ALLOWED_MIME = new Set(Object.keys(ALLOWED_TYPES));

/** Magic-number checks for formats that have one. Others fall through as accepted. */
const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
	'image/jpeg': (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
	'image/png': (h) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	'image/gif': (h) => h.subarray(0, 4).toString('latin1') === 'GIF8',
	'image/webp': (h) =>
		h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
	'application/pdf': (h) => h.subarray(0, 4).toString('latin1') === '%PDF',
	'application/zip': (h) => h[0] === 0x50 && h[1] === 0x4b,
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (h) => h[0] === 0x50 && h[1] === 0x4b,
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (h) => h[0] === 0x50 && h[1] === 0x4b,
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': (h) => h[0] === 0x50 && h[1] === 0x4b,
	// Legacy Office (OLE compound file)
	'application/msword': (h) => h.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
	'application/vnd.ms-powerpoint': (h) => h.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
	// xls may be OLE or (commonly mislabelled) CSV text; accept either.
	'application/vnd.ms-excel': (h) => h.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) || !h.includes(0),
	'text/plain': (h) => !h.includes(0),
	'text/csv': (h) => !h.includes(0),
};

export interface UploadCandidate {
	mimeType: string;
	sizeBytes: number;
	filename: string;
	/** First bytes of the payload (at least 12). */
	head: Buffer;
}

/** Returns a human-readable rejection reason, or null when the upload is acceptable. */
export function checkUpload(c: UploadCandidate): string | null {
	const mime = c.mimeType.split(';')[0].trim().toLowerCase();
	const allowed = ALLOWED_TYPES[mime];
	if (!allowed) return `Files of type ${mime || 'unknown'} are not accepted`;
	if (c.sizeBytes <= 0) return 'The file is empty';
	if (c.sizeBytes > MAX_FILE_BYTES) return `Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller`;

	const ext = extensionOf(c.filename);
	if (!ext || !allowed.includes(ext)) return `A .${ext || '?'} file does not match its declared type`;

	const sig = SIGNATURES[mime];
	if (sig && !sig(c.head)) return 'The file contents do not match its declared type';

	return null;
}

export function extensionOf(filename: string): string {
	const base = filename.split(/[\\/]/).pop() ?? '';
	const i = base.lastIndexOf('.');
	return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

/**
 * Strip anything that could be used for traversal, header injection or
 * display tricks, and cap the length. Always returns a non-empty name.
 */
export function sanitizeFilename(input: string | undefined | null): string {
	let name = (input ?? '').split(/[\\/]/).pop() ?? '';
	// control chars, quotes, header separators, unicode bidi overrides
	// eslint-disable-next-line no-control-regex
	name = name.replace(/[\u0000-\u001f\u007f"'\\;\u202a-\u202e\u2066-\u2069]/g, '');
	name = name.replace(/^\.+/, '').trim();
	if (!name) name = 'file';
	if (name.length > 200) {
		const ext = extensionOf(name);
		name = name.slice(0, 200 - (ext ? ext.length + 1 : 0)) + (ext ? '.' + ext : '');
	}
	return name;
}

/** RFC 6266 / 5987 Content-Disposition with an ASCII fallback. */
export function contentDisposition(filename: string): string {
	const safe = sanitizeFilename(filename);
	const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
