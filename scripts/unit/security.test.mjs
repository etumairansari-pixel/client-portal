import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RateLimiter, RATE_LIMITS } from '../../server/utils/rate-limit.ts';
import { redact } from '../../server/utils/log.ts';
import { createLocalStorageDriver } from '../../server/services/storage/local.ts';
import { createS3StorageDriver } from '../../server/services/storage/s3.ts';
import { assertStorageKey } from '../../server/services/storage/types.ts';
import { checkUpload, sanitizeFilename, contentDisposition, ALLOWED_MIME } from '../../server/services/storage/validate.ts';
import { bootstrapOwner, validateOwnerInput } from '../lib/bootstrap-owner.mjs';

// ------------------------------------------------------------ rate limiting

test('rate limiter allows up to the limit, blocks after, and recovers when the window passes', () => {
	let now = 1_000_000;
	const rl = new RateLimiter(() => now);
	const rule = { limit: 3, windowMs: 60_000 };
	assert.equal(rl.hit('k', rule).allowed, true);
	assert.equal(rl.hit('k', rule).allowed, true);
	assert.equal(rl.hit('k', rule).allowed, true);
	const blocked = rl.hit('k', rule);
	assert.equal(blocked.allowed, false);
	assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
	assert.equal(rl.hit('other', rule).allowed, true, 'keys are independent');
	now += 60_001;
	assert.equal(rl.hit('k', rule).allowed, true, 'window expired');
});

test('rate limiter reset clears failures (successful login)', () => {
	const rl = new RateLimiter(() => 5);
	const rule = { limit: 1, windowMs: 1000 };
	rl.hit('a', rule);
	assert.equal(rl.hit('a', rule).allowed, false);
	rl.reset('a');
	assert.equal(rl.hit('a', rule).allowed, true);
});

test('policies exist for every sensitive endpoint', () => {
	for (const k of ['loginPerIp', 'loginFailuresPerEmail', 'forgotPasswordPerIp', 'forgotPasswordPerEmail', 'resetPasswordPerIp', 'changePasswordPerUser', 'uploadPerUser', 'clientCreatePerOwner']) {
		assert.ok(RATE_LIMITS[k].limit > 0 && RATE_LIMITS[k].windowMs > 0, k);
	}
});

// --------------------------------------------------------------- redaction

test('redact hides connection strings, tokens, hashes and key=value secrets', () => {
	const out = redact('mongodb+srv://admin:Sup3rSecret@cluster0.abc.mongodb.net/db?retryWrites=true');
	assert.ok(!out.includes('Sup3rSecret') && !out.includes('admin:'), out);
	assert.ok(out.includes('mongodb+srv://***@cluster0'), out);
	assert.ok(!redact('password=hunter2 token: abcdef').includes('hunter2'));
	assert.ok(!redact('$argon2id$v=19$m=19456,t=2,p=1$abc$def').includes('$argon2id$v=19'));
	assert.ok(!redact({ SMTP_PASS: 'mailpass123', other: 'x' }).includes('mailpass123'));
	assert.ok(!redact('reset ' + 'A'.repeat(43)).includes('A'.repeat(43)), 'long token blobs are masked');
	assert.ok(redact(new Error('boom')).includes('boom'));
});

// ---------------------------------------------------------------- storage

test('local driver stores under a random tenant-prefixed key and refuses traversal', async () => {
	const root = mkdtempSync(join(tmpdir(), 'eiretech-store-'));
	const d = createLocalStorageDriver(root);
	const stored = await d.put(Buffer.from('hello'), { organizationId: 'abc123' });
	assert.match(stored.storageKey, /^abc123\/[a-f0-9]{48}$/);
	assert.equal(stored.sizeBytes, 5);
	assert.equal((await d.get(stored.storageKey)).toString(), 'hello');
	await d.remove(stored.storageKey);
	assert.ok(!existsSync(join(root, stored.storageKey)));
	for (const bad of ['../etc/passwd', 'abc123/../../x', 'abc123/a.b', '/abs', 'abc123\\x', 'abc123/x/y']) {
		await assert.rejects(() => d.get(bad), /Invalid storage key/, bad);
	}
	await assert.rejects(() => d.put(Buffer.from('x'), { organizationId: '../evil' }), /Invalid organization id/);
	rmSync(root, { recursive: true, force: true });
});

test('s3 driver talks to the bucket by key only and never builds public URLs', async () => {
	const sent = [];
	const client = { async send(cmd) { sent.push(cmd); if (cmd.kind === 'get') return { Body: { transformToByteArray: async () => new Uint8Array([104, 105]) } }; return {}; } };
	const cmd = (kind) => class { constructor(input) { this.kind = kind; this.input = input; } };
	const d = createS3StorageDriver(client, { put: cmd('put'), get: cmd('get'), del: cmd('del') }, 'private-bucket');
	const stored = await d.put(Buffer.from('hi'), { organizationId: 'org1' });
	assert.equal(sent[0].kind, 'put');
	assert.equal(sent[0].input.Bucket, 'private-bucket');
	assert.equal(sent[0].input.Key, stored.storageKey);
	assert.ok(!('ACL' in sent[0].input), 'no public ACL');
	assert.equal((await d.get(stored.storageKey)).toString(), 'hi');
	await d.remove(stored.storageKey);
	assert.equal(sent[2].kind, 'del');
	await assert.rejects(() => d.get('../x'), /Invalid storage key/);
	assert.throws(() => assertStorageKey('org/../x'));
});

// ------------------------------------------------------------- uploads

const pdf = Buffer.from('%PDF-1.4 hello');
test('checkUpload enforces allow-list, extension agreement, magic bytes and size', () => {
	assert.equal(checkUpload({ mimeType: 'application/pdf', sizeBytes: 14, filename: 'brief.pdf', head: pdf }), null);
	assert.match(checkUpload({ mimeType: 'image/svg+xml', sizeBytes: 5, filename: 'x.svg', head: Buffer.from('<svg>') }), /not accepted/);
	assert.match(checkUpload({ mimeType: 'text/html', sizeBytes: 5, filename: 'x.html', head: Buffer.from('<html') }), /not accepted/);
	assert.match(checkUpload({ mimeType: 'application/pdf', sizeBytes: 14, filename: 'brief.exe', head: pdf }), /does not match/);
	assert.match(checkUpload({ mimeType: 'application/pdf', sizeBytes: 14, filename: 'brief.pdf', head: Buffer.from('MZ.......') }), /contents do not match/);
	assert.match(checkUpload({ mimeType: 'image/png', sizeBytes: 9, filename: 'a.png', head: Buffer.from('GIF89a...') }), /contents/);
	assert.match(checkUpload({ mimeType: 'application/pdf', sizeBytes: 16 * 1024 * 1024, filename: 'big.pdf', head: pdf }), /15 MB/);
	assert.match(checkUpload({ mimeType: 'application/pdf', sizeBytes: 0, filename: 'e.pdf', head: Buffer.alloc(0) }), /empty/);
	assert.equal(checkUpload({ mimeType: 'text/plain; charset=utf-8', sizeBytes: 5, filename: 'notes.txt', head: Buffer.from('hello') }), null);
	assert.match(checkUpload({ mimeType: 'text/plain', sizeBytes: 5, filename: 'bin.txt', head: Buffer.from([0, 1, 2]) }), /contents/);
	assert.ok(!ALLOWED_MIME.has('image/svg+xml'));
});

test('sanitizeFilename strips paths, control characters and header-breaking characters', () => {
	assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
	assert.equal(sanitizeFilename('C:\\Users\\x\\report.pdf'), 'report.pdf');
	assert.equal(sanitizeFilename('bad"name\r\nX-Injected: 1.pdf'), 'badnameX-Injected: 1.pdf');
	assert.equal(sanitizeFilename('.hidden'), 'hidden');
	assert.equal(sanitizeFilename(''), 'file');
	assert.equal(sanitizeFilename(undefined), 'file');
	assert.ok(sanitizeFilename('a'.repeat(300) + '.pdf').length <= 200);
	assert.ok(sanitizeFilename('a'.repeat(300) + '.pdf').endsWith('.pdf'));
	assert.equal(sanitizeFilename('inv\u202eexe.pdf'), 'invexe.pdf');
});

test('contentDisposition is attachment-only with an ASCII fallback and RFC 5987 name', () => {
	const h = contentDisposition('résumé "final".pdf');
	assert.ok(h.startsWith('attachment; filename="r_sum_ final.pdf"'), h);
	assert.ok(h.includes("filename*=UTF-8''r%C3%A9sum%C3%A9%20final.pdf"), h);
	assert.ok(!h.includes('\n'));
});

// ------------------------------------------------------- owner bootstrap

function fakePrisma(existing = null) {
	const created = [];
	return {
		created,
		user: {
			async findUnique() { return existing; },
			async create({ data }) { created.push(data); return { id: 'new', email: data.email }; },
		},
	};
}
const hash = async (p) => `$argon2id$fake$${p.length}`;

test('bootstrapOwner validates input and never echoes the password', () => {
	const problems = validateOwnerInput({ email: 'bad', name: '', password: 'short' });
	assert.equal(problems.length, 3);
	assert.ok(!problems.join(' ').includes('short'));
});

test('bootstrapOwner refuses an existing email', async () => {
	const prisma = fakePrisma({ id: '1', role: 'CLIENT' });
	const r = await bootstrapOwner({ email: 'A@Example.com', name: 'Ann Owner', password: 'correct horse battery' }, { prisma, hash });
	assert.equal(r.ok, false);
	assert.equal(r.reason, 'exists');
	assert.equal(prisma.created.length, 0);
});

test('bootstrapOwner creates an active OWNER with a hashed password', async () => {
	const prisma = fakePrisma(null);
	const r = await bootstrapOwner({ email: 'A@Example.com', name: 'Ann Owner', password: 'correct horse battery' }, { prisma, hash });
	assert.equal(r.ok, true);
	const row = prisma.created[0];
	assert.equal(row.email, 'a@example.com');
	assert.equal(row.role, 'OWNER');
	assert.equal(row.status, 'ACTIVE');
	assert.equal(row.mustChangePassword, false);
	assert.equal(row.firstName, 'Ann');
	assert.equal(row.lastName, 'Owner');
	assert.ok(row.passwordHash.startsWith('$argon2id$') && !row.passwordHash.includes('correct horse'));
});
