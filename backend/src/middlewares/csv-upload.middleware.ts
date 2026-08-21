// src/middlewares/csv-upload.middleware.ts
//
// Instância de multer separada para a importação de CSV, para que o uploader de
// documentos (imagens + PDF) continue fechado ao que aceita. Alargar aquele
// para engolir CSV abriria a porta a enviar uma folha de cálculo como Cartão de
// Cidadão; cada porta aceita o que a sua tela precisa.

import multer from 'multer';
import { AppError } from '../shared/errors/AppError';

const ALLOWED = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',     // alguns browsers rotulam .csv assim
  'text/plain',                   // recurso para .csv em certos sistemas
];

const MAX_SIZE_MB = 5;

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // A extensão vale como alternativa ao mimetype porque este varia com o
    // browser e o sistema: o mesmo ficheiro chega como text/csv, como
    // application/vnd.ms-excel ou como text/plain conforme a máquina de quem
    // envia. Recusar por causa disso seria recusar um ficheiro válido.
    const okType = ALLOWED.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv');
    if (okType) cb(null, true);
    else cb(new AppError('Envie um ficheiro .csv válido.', 400, 'INVALID_FILE_TYPE'));
  },
});
