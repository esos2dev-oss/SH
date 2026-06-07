// Multer en memoria para subida de archivos. Validacion de mime types comunes.

import multer from 'multer';
import { Errors } from '../utils/app-error.js';

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_PDF = ['application/pdf'];
const ALLOWED_ALL = [...ALLOWED_IMAGE, ...ALLOWED_PDF];

const storage = multer.memoryStorage();

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE.includes(file.mimetype)) {
      cb(Errors.validation(`Tipo de archivo no permitido: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

export const uploadReceipt = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ALL.includes(file.mimetype)) {
      cb(Errors.validation(`Tipo de archivo no permitido: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

export const uploadDocument = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ALL.includes(file.mimetype)) {
      cb(Errors.validation(`Tipo de archivo no permitido: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});
