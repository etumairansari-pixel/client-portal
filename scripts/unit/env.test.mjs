import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, EnvError, warnings } from '../../server/utils/env.ts';

const SECRET = 'a'.repeat(40);
const base = { DATABASE_URL: 'mongodb+srv://user:hunter2@cluster.example.net/db', SESSION_SECRET: SECRET, APP_URL: 'https://portal.example.com' };

test('accepts a minimal valid development environment', () => {
	const env = parseEnv({ ...base });
	assert.equal(env.NODE_ENV, 'development');
	assert.equal(env.isProduction, false);
	assert.equal(env.mailEnabled, false);
	assert.equal(env.STORAGE_DRIVER, 'local');
});

test('names the missing variable without printing any value', () => {
	assert.throws(
		() => parseEnv({ SESSION_SECRET: SECRET }),
		(e) => e instanceof EnvError && e.problems.some((p) => p.includes('DATABASE_URL')) && !e.message.includes('hunter2'),
	);
});

test('rejects a non-mongodb DATABASE_URL', () => {
	assert.throws(() => parseEnv({ ...base, DATABASE_URL: 'mysql://x' }), /mongodb/);
});

test('production requires a long SESSION_SECRET', () => {
	assert.throws(() => parseEnv({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'short' }), /SESSION_SECRET must be at least 32/);
});

test('production refuses MAIL_OUTBOX_FILE', () => {
	assert.throws(() => parseEnv({ ...base, NODE_ENV: 'production', MAIL_OUTBOX_FILE: 'x.jsonl' }), /MAIL_OUTBOX_FILE/);
});

test('production warns (does not fail) on a local APP_URL and local storage', () => {
	parseEnv({ ...base, NODE_ENV: 'production', APP_URL: 'http://localhost:3000' });
	assert.ok(warnings.some((w) => w.includes('APP_URL')));
	assert.ok(warnings.some((w) => w.includes('STORAGE_DRIVER=local')));
});

test('SMTP_HOST enables mail and requires SMTP_FROM plus paired credentials', () => {
	assert.throws(() => parseEnv({ ...base, SMTP_HOST: 'smtp.example.com' }), /SMTP_FROM/);
	assert.throws(() => parseEnv({ ...base, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'a@b.c', SMTP_USER: 'u' }), /SMTP_USER and SMTP_PASS/);
	const env = parseEnv({ ...base, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'Eiretech <no-reply@example.com>', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: '465' });
	assert.equal(env.mailEnabled, true);
	assert.equal(env.SMTP_PORT, 465);
});

test('s3 storage requires bucket, keys and a region or endpoint', () => {
	assert.throws(
		() => parseEnv({ ...base, STORAGE_DRIVER: 's3' }),
		(e) => e instanceof EnvError && ['S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_REGION'].every((k) => e.message.includes(k)),
	);
	const env = parseEnv({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's', S3_ENDPOINT: 'https://s3.example.com' });
	assert.equal(env.STORAGE_DRIVER, 's3');
});

test('APP_URL trailing slash is normalised', () => {
	assert.equal(parseEnv({ ...base, APP_URL: 'https://portal.example.com/' }).APP_URL, 'https://portal.example.com');
});

test('empty values in .env are treated as unset', () => {
	const env = parseEnv({ ...base, SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '   ', STORAGE_DRIVER: '' });
	assert.equal(env.mailEnabled, false);
	assert.equal(env.SMTP_PORT, 587);
	assert.equal(env.STORAGE_DRIVER, 'local');
});
