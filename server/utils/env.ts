import { z } from 'zod';

/**
 * Central, validated view of the process environment.
 *
 * Every server module reads configuration from here rather than from
 * `process.env` directly, so a missing or malformed variable fails once, at
 * startup, with a message that names the variable — never its value.
 *
 * This module is framework-free (no Nitro globals) so it can be unit-tested
 * and reused by the CLI scripts.
 */

const nonEmpty = (name: string) => z.string().trim().min(1, `${name} is required`);
const optionalString = z
	.string()
	.trim()
	.optional()
	.transform((v) => (v ? v : undefined));

const baseSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	DATABASE_URL: nonEmpty('DATABASE_URL').refine(
		(v) => /^mongodb(\+srv)?:\/\//.test(v),
		'DATABASE_URL must be a mongodb:// or mongodb+srv:// connection string',
	),
	SESSION_SECRET: nonEmpty('SESSION_SECRET'),
	APP_URL: z
		.string()
		.trim()
		.url('APP_URL must be an absolute URL')
		.transform((v) => v.replace(/\/+$/, ''))
		.default('http://localhost:3000'),

	// Mail. Enabled when SMTP_HOST is present; the rest are validated together.
	SMTP_HOST: optionalString,
	SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
	SMTP_USER: optionalString,
	SMTP_PASS: optionalString,
	SMTP_FROM: optionalString,
	SMTP_SECURE: z
		.enum(['true', 'false'])
		.optional()
		.transform((v) => v === 'true'),
	// Development/test only: append every outgoing message as JSON to this file.
	MAIL_OUTBOX_FILE: optionalString,

	// Files.
	STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
	STORAGE_ROOT: z.string().trim().default('.data/uploads'),
	S3_ENDPOINT: optionalString,
	S3_REGION: optionalString,
	S3_BUCKET: optionalString,
	S3_ACCESS_KEY: optionalString,
	S3_SECRET_KEY: optionalString,
	S3_FORCE_PATH_STYLE: z
		.enum(['true', 'false'])
		.optional()
		.transform((v) => v === 'true'),
});

export type Env = z.infer<typeof baseSchema> & {
	isProduction: boolean;
	mailEnabled: boolean;
};

export class EnvError extends Error {
	readonly problems: string[];

	constructor(problems: string[]) {
		super(`Invalid environment:\n  - ${problems.join('\n  - ')}`);
		this.name = 'EnvError';
		this.problems = problems;
	}
}

/** Non-fatal notices collected during the last parse. */
export const warnings: string[] = [];

/**
 * Parse and cross-validate. Throws EnvError listing every problem at once.
 * Messages only ever mention variable NAMES.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
	warnings.length = 0;
	// An empty value in a .env file means "unset", not "empty string".
	const cleaned: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(source)) cleaned[k] = v !== undefined && v.trim() === '' ? undefined : v;
	const result = baseSchema.safeParse(cleaned);
	const problems: string[] = [];

	if (!result.success) {
		for (const issue of result.error.issues) {
			problems.push(
				issue.message.includes(String(issue.path[0])) ? issue.message : `${issue.path.join('.')}: ${issue.message}`,
			);
		}
		throw new EnvError(problems);
	}

	const env = result.data;
	const isProduction = env.NODE_ENV === 'production';
	const mailEnabled = Boolean(env.SMTP_HOST);

	if (isProduction) {
		if (env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be at least 32 characters in production');
		// Links in emails and redirects are built from APP_URL, so a local or
		// plain-http value is almost certainly wrong — but a local preview of the
		// production build is legitimate, so warn rather than refuse.
		if (!/^https:\/\//.test(env.APP_URL) || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(env.APP_URL)) {
			warnings.push('APP_URL is not a public https URL; links in emails will point at it as-is');
		}
		if (env.MAIL_OUTBOX_FILE)
			problems.push('MAIL_OUTBOX_FILE is a development-only setting and must not be set in production');
		if (env.STORAGE_DRIVER === 'local') {
			// Not fatal — Hostinger may keep a persistent disk — but it is a
			// documented risk, so say so loudly rather than silently accept it.
			warnings.push('STORAGE_DRIVER=local in production: uploads live on the application server disk');
		}
	}

	if (mailEnabled) {
		if (!env.SMTP_FROM) problems.push('SMTP_FROM is required when SMTP_HOST is set');
		if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS))
			problems.push('SMTP_USER and SMTP_PASS must be set together');
	}

	if (env.STORAGE_DRIVER === 's3') {
		for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
			if (!env[key]) problems.push(`${key} is required when STORAGE_DRIVER=s3`);
		}
		if (!env.S3_REGION && !env.S3_ENDPOINT)
			problems.push('S3_REGION or S3_ENDPOINT is required when STORAGE_DRIVER=s3');
	}

	if (problems.length) throw new EnvError(problems);

	return { ...env, isProduction, mailEnabled };
}

let cached: Env | null = null;

/** Lazily parsed singleton. The startup plugin calls this first so failures surface immediately. */
export function getEnv(): Env {
	if (!cached) cached = parseEnv();
	return cached;
}

/** Test hook. */
export function resetEnvCache() {
	cached = null;
	warnings.length = 0;
}
