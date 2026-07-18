// src/middlewares/csv-upload.middleware.ts
//
// Separate multer instance for CSV imports, so the document uploader
// (images + PDF) stays locked down. Use this on the earnings import routes
// instead of the shared `upload` if you prefer not to touch ALLOWED_TYPES.

import multer from 'multer';
import { AppError } from '../shared/errors/AppError';

const ALLOWED = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',     // some browsers label .csv as this
  'text/plain',                   // fallback for .csv from certain OSes
];

const MAX_SIZE_MB = 5;

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okType = ALLOWED.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv');
    if (okType) cb(null, true);
    else cb(new AppError('Envie um arquivo .csv válido.', 400, 'INVALID_FILE_TYPE'));
  },
});
