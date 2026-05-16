// Abstraccion de storage: R2 si esta configurado, sino local en backend/uploads/.
// Devuelve URLs publicas o presigned segun el caso.

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { r2Configured } from '../config/r2.js';
import { uploadObject, buildKey, getPresignedGetUrl, deleteObject } from './r2.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = resolve(__dirname, '../../../uploads');
const LOCAL_PUBLIC_PREFIX = '/uploads';

export interface UploadInput {
  folder: string;
  buffer: Buffer;
  contentType: string;
  originalName: string;
}

export interface StoredObject {
  /** Identificador opaco: key de R2 o ruta relativa local. */
  storageKey: string;
  /** URL utilizable inmediatamente para mostrar (presigned o publica). */
  url: string;
  /** True si la URL es temporal y debe regenerarse periodicamente. */
  ephemeral: boolean;
}

function makeFilename(originalName: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const rand = randomBytes(6).toString('hex');
  return `${Date.now()}-${rand}-${safe}`;
}

export async function putObject(input: UploadInput): Promise<StoredObject> {
  if (r2Configured) {
    const key = buildKey(input.folder, input.originalName);
    await uploadObject({ key, buffer: input.buffer, contentType: input.contentType });
    const url = await getPresignedGetUrl(key, 60 * 60 * 24 * 7); // 7 dias
    return { storageKey: key, url, ephemeral: true };
  }
  // Local fallback
  const folderPath = join(LOCAL_ROOT, input.folder);
  await mkdir(folderPath, { recursive: true });
  const filename = makeFilename(input.originalName);
  await writeFile(join(folderPath, filename), input.buffer);
  const relKey = `${input.folder}/${filename}`;
  const base = (env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
  return {
    storageKey: relKey,
    url: `${base}${LOCAL_PUBLIC_PREFIX}/${relKey}`,
    ephemeral: false,
  };
}

/** Regenera URL para un storage key (R2 presigned o local URL). */
export async function getUrl(storageKey: string, ttlSeconds = 900): Promise<string> {
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
    return storageKey;
  }
  if (r2Configured) {
    return getPresignedGetUrl(storageKey, ttlSeconds);
  }
  const base = (env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
  return `${base}${LOCAL_PUBLIC_PREFIX}/${storageKey}`;
}

/** Borra el objeto del storage. Best-effort: no falla si no existe. */
export async function removeObject(storageKey: string): Promise<void> {
  if (r2Configured) {
    try { await deleteObject(storageKey); } catch { /* ignore */ }
    return;
  }
  try {
    await unlink(join(LOCAL_ROOT, storageKey));
  } catch { /* ignore */ }
}
