// Servicio R2: upload, delete, presigned URLs.
// Si R2 no esta configurado, throw para fallar visible.

import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET, r2Configured } from '../config/r2.js';
import { Errors } from '../utils/app-error.js';

function ensureClient(): asserts r2Client is NonNullable<typeof r2Client> {
  if (!r2Configured || !r2Client) {
    throw Errors.internal('Storage R2 no esta configurado');
  }
}

export interface UploadInput {
  key: string;
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export async function uploadObject(input: UploadInput): Promise<{ key: string }> {
  ensureClient();
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: input.key,
      Body: input.buffer,
      ContentType: input.contentType,
      ...(input.metadata && { Metadata: input.metadata }),
    }),
  );
  return { key: input.key };
}

export async function deleteObject(key: string): Promise<void> {
  ensureClient();
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/** Genera presigned URL para GET con TTL en segundos (default 900 = 15 min). */
export async function getPresignedGetUrl(key: string, ttlSeconds = 900): Promise<string> {
  ensureClient();
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2Client, cmd, { expiresIn: ttlSeconds });
}

/** Construye un key de R2 segmentado por carpeta. */
export function buildKey(folder: string, originalName: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${folder}/${timestamp}-${random}-${safe}`;
}
