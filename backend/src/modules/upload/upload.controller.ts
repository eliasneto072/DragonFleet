import { Request, Response } from 'express';

import streamifier from 'streamifier';

import { cloudinary } from '../../config/cloudinary';

class UploadController {

  async upload(req: Request, res: Response) {

    try {

      const file = req.file;

      if (!file) {

        return res.status(400).json({
          ok: false,
          message: 'Imagem não enviada'
        });

      }

      const result = await new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'bras-conecta',
          },
          (error, result) => {

            if (error) {
              reject(error);
            } else {
              resolve(result);
            }

          }
        );

        streamifier
          .createReadStream(file.buffer)
          .pipe(stream);

      });

      return res.status(200).json({
        ok: true,
        data: result
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        ok: false,
        message: 'Erro ao realizar upload'
      });

    }

  }

}

export { UploadController };