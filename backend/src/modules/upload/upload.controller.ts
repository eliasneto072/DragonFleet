// src/modules/upload/upload.controller.ts
//
// FIX: removed the leftover `folder: 'bras-conecta'` (copied from another
// project) and now reuses the shared uploadToCloudinary helper so behavior
// (resource_type: 'auto', etc.) is consistent with document uploads.

import { Request, Response } from 'express';
import { uploadToCloudinary } from './upload.service';

class UploadController {
  async upload(req: Request, res: Response) {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ ok: false, message: 'Ficheiro não enviado' });
      }

      const result = await uploadToCloudinary(file.buffer, file.mimetype, 'uploads');

      return res.status(200).json({ ok: true, data: result });
    } catch (err) {
      console.error('[upload] Falha no upload:', err);
      return res.status(500).json({ ok: false, message: 'Erro ao realizar upload' });
    }
  }
}

export { UploadController };
