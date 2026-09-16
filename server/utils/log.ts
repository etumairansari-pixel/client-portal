/**
 * Minimal structured logger with secret redaction.
 *
 * Everything the server prints goes through here so a connection string, a
 * token or a password can never reach the process output by accident. Nothing
 * here depends on Nitro, so scripts and unit tests can use it too.
 */

const REDACTIONS: Array<[RegExp, string]> = [
	// mongodb://user:pass@host → mongodb://***@host
	[/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, '$1***@'],
	// any url with basic-auth credentials
	[/(https?:\/\/)[^@\s/]+:[^@\s/]+@/gi, '$1***@'],
	// key=value style secrets
	[
		/([\w-]*(?:password|passwd|pass|secret|token|api[_-]?key|access[_-]?key|authorization|cookie))("?\s*[:=]\s*"?)[^\s"',;&]+/gi,
		'$1$2[redacted]',
	],
	// long base64url / hex blobs that look like tokens
	[/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]'],
	// argon2 hashes
	[/\$argon2[a-z]*\$[^\s"']+/g, '[redacted-hash]'],
];

export function redact(input: unknown): string {
	let text: string;
	if (typeof input === 'string') text = input;
	else if (input instanceof Error) text = `${input.name}: ${input.message}`;
	else {
		try {
			text = JSON.stringify(input);
		} catch {
			text = String(input);
		}
	}
	for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
	return text;
}

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, message: string, meta?: unknown) {
	const line = `${new Date().toISOString()} [${scope}] ${redact(message)}${meta === undefined ? '' : ' ' + redact(meta)}`;
	// eslint-disable-next-line no-console
	console[level](line);
}

export const log = {
	info: (scope: string, message: string, meta?: unknown) => emit('info', scope, message, meta),
	warn: (scope: string, message: string, meta?: unknown) => emit('warn', scope, message, meta),
	error: (scope: string, message: string, meta?: unknown) => emit('error', scope, message, meta),
};
