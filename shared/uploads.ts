/**
 * Upload allow-list shared by the server validator and the browser file
 * pickers, so the picker only offers what the server will accept and the
 * hint text can never drift from the rule.
 *
 * SVG and HTML are deliberately absent: a browser can execute them.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Declared MIME → acceptable extensions. */
export const ALLOWED_TYPES: Record<string, readonly string[]> = {
	'image/jpeg': ['jpg', 'jpeg'],
	'image/png': ['png'],
	'image/gif': ['gif'],
	'image/webp': ['webp'],
	'application/pdf': ['pdf'],
	'text/plain': ['txt', 'md', 'log'],
	'text/csv': ['csv'],
	'application/msword': ['doc'],
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
	'application/vnd.ms-excel': ['xls', 'csv'],
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
	'application/vnd.ms-powerpoint': ['ppt'],
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
	'application/zip': ['zip'],
};

/** Value for `<input type="file" accept>`: every allowed extension. */
export const UPLOAD_ACCEPT = [...new Set(Object.values(ALLOWED_TYPES).flat())].map((e) => `.${e}`).join(',');

/** Short human-readable version for hint text under the picker. */
export const UPLOAD_HINT = 'PNG, JPG, GIF, WebP, PDF, Word, Excel, PowerPoint, CSV, TXT or ZIP — up to 15 MB each';
