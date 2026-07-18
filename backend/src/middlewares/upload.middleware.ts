// src/middlewares/upload.middleware.ts
//
// FIX: broadened accepted types (was images + PDF only) to include common
// document formats, and corrected the error message that said "imagem".

import multer from 'multer';
import { AppError } from '../shared/errors/AppError';

const ALLOWED_TYPES = [
  // Imagens
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  // Documentos
  'application/pdf',
  'application/msword',                                                     // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const MAX_SIZE_MB = 10;

export const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_SIZE_MB * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(
        'Formato inválido. Envie uma imagem (JPG, PNG, WebP, HEIC) ou um documento (PDF, DOC, DOCX).',
        400,
        'INVALID_FILE_TYPE',
      ));
    }
  },
});
