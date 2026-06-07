// Cliente S3 apuntando a Cloudflare R2.
// Si las credenciales no estan configuradas, exporta null y los servicios deben manejarlo.

import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let _client: S3Client | null = null;

if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT) {
  _client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
} else {
  logger.warn('R2 no configurado — uploads y presigned URLs estaran desactivados');
}

export const r2Client = _client;
export const R2_BUCKET = env.R2_BUCKET ?? '';
export const r2Configured = _client !== null && R2_BUCKET !== '';
