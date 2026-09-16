import { randomBytes } from 'node:crypto';
import { assertStorageKey, newStorageKey, type StorageDriver } from './types.ts';

/**
 * S3-compatible object storage driver.
 *
 * Works with AWS S3, Cloudflare R2, Backblaze B2, MinIO, DigitalOcean Spaces
 * and any other S3 API — the vendor is just an endpoint. The bucket is
 * expected to be PRIVATE; this driver never generates public URLs.
 *
 * The client is injected so the driver can be exercised without network
 * access; production wires in the real `S3Client`.
 */

export interface S3Options {
	bucket: string;
	region?: string;
	endpoint?: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle?: boolean;
}

/** The subset of the AWS SDK surface this driver uses. */
export interface S3Like {
	send(command: unknown): Promise<unknown>;
}

export interface S3Commands {
	put: new (input: { Bucket: string; Key: string; Body: Buffer; ContentLength: number }) => unknown;
	get: new (input: { Bucket: string; Key: string }) => unknown;
	del: new (input: { Bucket: string; Key: string }) => unknown;
}

export function createS3StorageDriver(client: S3Like, commands: S3Commands, bucket: string): StorageDriver {
	return {
		name: 's3',
		async put(data, { organizationId }) {
			const storageKey = newStorageKey(organizationId, randomBytes(24).toString('hex'));
			await client.send(
				new commands.put({ Bucket: bucket, Key: storageKey, Body: data, ContentLength: data.byteLength }),
			);
			return { storageKey, sizeBytes: data.byteLength };
		},
		async get(storageKey) {
			assertStorageKey(storageKey);
			const res = (await client.send(new commands.get({ Bucket: bucket, Key: storageKey }))) as {
				Body?: { transformToByteArray(): Promise<Uint8Array> };
			};
			if (!res.Body) throw new Error('Object not found');
			return Buffer.from(await res.Body.transformToByteArray());
		},
		async remove(storageKey) {
			assertStorageKey(storageKey);
			await client.send(new commands.del({ Bucket: bucket, Key: storageKey })).catch(() => undefined);
		},
	};
}

/** Production factory: real AWS SDK client from validated config. */
export async function createS3StorageDriverFromConfig(o: S3Options): Promise<StorageDriver> {
	const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
	const client = new S3Client({
		region: o.region ?? 'auto',
		endpoint: o.endpoint,
		forcePathStyle: o.forcePathStyle ?? Boolean(o.endpoint),
		credentials: { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey },
	});
	return createS3StorageDriver(
		client,
		{ put: PutObjectCommand, get: GetObjectCommand, del: DeleteObjectCommand },
		o.bucket,
	);
}
