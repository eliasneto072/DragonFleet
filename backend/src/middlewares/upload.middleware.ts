import multer from 'multer';
import { AppError } from '../shared/errors/AppError';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
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
        'Formato inválido. Envie uma imagem JPEG, PNG, WebP ou PDF.',
        400,
        'INVALID_FILE_TYPE',
      ));
    }
  },
});