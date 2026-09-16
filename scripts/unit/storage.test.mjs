import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { newStorageKey, assertStorageKey } from '../../server/services/storage/types.ts';
import { createLocalStorageDriver } from '../../server/services/storage/local.ts';
import { createS3StorageDriver } from '../../server/services/storage/s3.ts';
import { checkUpload, sanitizeFilename, contentDisposition, MAX_FILE_BYTES } from '../../server/services/storage/validate.ts';

const ORG = '6aa81ec0db56720d674e1770';
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);

test('storage keys are tenant-prefixed, random, and strictly validated', () => {
	const a = newStorageKey(ORG, 'abc123');
	assert.equal(a, `${ORG}/abc123`);
	assert.throws(() => newStorageKey('../etc', 'x'), /Invalid organization id/);
	assert.throws(() => newStorageKey(`${ORG}/..`, 'x'), /Invalid organization id/);

	assert.doesNotThrow(() => assertStorageKey(`${ORG}/AbC_-9`));
	for (const bad of ['../../etc/passwd', `${ORG}/../x`, `${ORG}/a.b`, `${ORG}/a/b`, '/abs', '', `${ORG}\\x`, `${ORG}/a b`]) {
		assert.throws(() => assertStorageKey(bad), /Invalid storage key/, `should reject ${JSON.stringify(bad)}`);
	}
});

test('local driver: round-trips bytes under a random tenant-prefixed key, and refuses traversal', async () => {
	const root = mkdtempSync(join(tmpdir(), 'eiretech-storage-'));
	try {
		const driver = createLocalStorageDriver(root);
		assert.equal(driver.name, 'local');

		const a = await driver.put(pdf, { organizationId: ORG });
		const b = await driver.put(pdf, { organizationId: ORG });
		assert.match(a.storageKey, new RegExp(`^${ORG}/[0-9a-f]{48}$`));
		assert.notEqual(a.storageKey, b.storageKey, 'keys are random, not content-derived');
		assert.equal(a.sizeBytes, pdf.byteLength);
		assert.ok(existsSync(resolve(root, a.storageKey)), 'file lives under the tenant folder');

		assert.deepEqual(await driver.get(a.storageKey), pdf);

		await driver.remove(a.storageKey);
		assert.ok(!existsSync(resolve(root, a.storageKey)));
		await driver.remove(a.storageKey); // idempotent

		for (const bad of ['../outside', `${ORG}/../../outside`, `${ORG}/..`, `${ORG}/x.txt`]) {
			await assert.rejects(driver.get(bad), /Invalid storage key/);
			await assert.rejects(driver.remove(bad), /Invalid storage key/);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('s3 driver: uses the injected client, private bucket, tenant-prefixed keys, and never public URLs', async () => {
	const sent = [];
	const objects = new Map();
	class Put { constructor(i) { this.kind = 'put'; this.input = i; } }
	class Get { constructor(i) { this.kind = 'get'; this.input = i; } }
	class Del { constructor(i) { this.kind = 'del'; this.input = i; } }
	const client = {
		async send(cmd) {
			sent.push(cmd);
			if (cmd.kind === 'put') { objects.set(cmd.input.Key, cmd.input.Body); return {}; }
			if (cmd.kind === 'get') {
				const body = objects.get(cmd.input.Key);
				return body ? { Body: { transformToByteArray: async () => new Uint8Array(body) } } : {};
			}
			if (cmd.kind === 'del') { objects.delete(cmd.input.Key); return {}; }
			throw new Error('unexpected command');
		},
	};
	const driver = createS3StorageDriver(client, { put: Put, get: Get, del: Del }, 'private-bucket');
	assert.equal(driver.name, 's3');

	const stored = await driver.put(pdf, { organizationId: ORG });
	assert.match(stored.storageKey, new RegExp(`^${ORG}/[0-9a-f]{48}$`));
	assert.equal(stored.sizeBytes, pdf.byteLength);
	assert.equal(sent[0].kind, 'put');
	assert.equal(sent[0].input.Bucket, 'private-bucket');
	assert.equal(sent[0].input.Key, stored.storageKey);
	assert.equal(sent[0].input.ContentLength, pdf.byteLength);
	assert.ok(!('ACL' in sent[0].input), 'no public ACL is ever requested');
	assert.ok(!JSON.stringify(stored).includes('http'), 'no URL leaves the driver');

	assert.deepEqual(await driver.get(stored.storageKey), pdf);
	assert.equal(sent[1].kind, 'get');
	assert.equal(sent[1].input.Key, stored.storageKey);

	await assert.rejects(driver.get(`${ORG}/missing000`), /Object not found/);

	await driver.remove(stored.storageKey);
	assert.equal(sent.at(-1).kind, 'del');
	assert.ok(!objects.has(stored.storageKey));

	// traversal never reaches the client
	const before = sent.length;
	await assert.rejects(driver.get('../../etc/passwd'), /Invalid storage key/);
	await assert.rejects(driver.remove(`${ORG}/../x`), /Invalid storage key/);
	assert.equal(sent.length, before, 'invalid keys are rejected before any S3 call');
});

test('checkUpload rejects executable and mismatched content, accepts well-formed files', () => {
	const ok = (c) => assert.equal(checkUpload(c), null, JSON.stringify(c.filename));
	const bad = (c, re) => assert.match(checkUpload(c) ?? '', re, JSON.stringify(c.filename));

	ok({ mimeType: 'application/pdf', sizeBytes: pdf.byteLength, filename: 'quote.pdf', head: pdf });
	ok({ mimeType: 'image/png', sizeBytes: 100, filename: 'shot.PNG', head: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) });
	ok({ mimeType: 'text/csv; charset=utf-8', sizeBytes: 10, filename: 'data.csv', head: Buffer.from('a,b\n1,2\n') });

	bad({ mimeType: 'image/svg+xml', sizeBytes: 10, filename: 'x.svg', head: Buffer.from('<svg></svg>') }, /not accepted/);
	bad({ mimeType: 'text/html', sizeBytes: 10, filename: 'x.html', head: Buffer.from('<html>') }, /not accepted/);
	bad({ mimeType: 'application/pdf', sizeBytes: 10, filename: 'x.html', head: pdf }, /does not match its declared type/);
	bad({ mimeType: 'application/pdf', sizeBytes: 10, filename: 'x.pdf', head: Buffer.from('<html><script>') }, /contents do not match/);
	bad({ mimeType: 'image/png', sizeBytes: 10, filename: 'x.png', head: Buffer.from('GIF89a......') }, /contents do not match/);
	bad({ mimeType: 'text/plain', sizeBytes: 10, filename: 'x.txt', head: Buffer.from([0x41, 0x00, 0x42, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }, /contents do not match/);
	bad({ mimeType: 'application/pdf', sizeBytes: 10, filename: 'noext', head: pdf }, /does not match/);
	bad({ mimeType: 'application/pdf', sizeBytes: 0, filename: 'x.pdf', head: pdf }, /empty/);
	bad({ mimeType: 'application/pdf', sizeBytes: MAX_FILE_BYTES + 1, filename: 'x.pdf', head: pdf }, /or smaller/);
});

test('filenames are sanitised and download headers are attachment-only', () => {
	assert.equal(sanitizeFilename('../../etc/passwd.pdf'), 'passwd.pdf');
	assert.equal(sanitizeFilename('C:\\Users\\me\\report.pdf'), 'report.pdf');
	assert.ok(sanitizeFilename('').length > 0, 'empty names get a fallback');
	const cd = contentDisposition('quote"and\r\nheader.pdf');
	assert.match(cd, /^attachment;/);
	assert.ok(!/[\r\n]/.test(cd), 'no header injection');
	assert.ok(!cd.includes('"and'), 'quotes are encoded');
});
