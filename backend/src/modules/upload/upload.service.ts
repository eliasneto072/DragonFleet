// src/modules/upload/upload.service.ts
//
// FIX: the previous version hardcoded `resource_type: 'image'` for every upload.
// Cloudinary treats PDFs and other documents as `raw`/`auto`, NOT `image`, so
// PDF uploads were being mangled or blocked — which is why uploads felt
// "photo only". Using `resource_type: 'auto'` lets Cloudinary detect the type
// (image for jpg/png/webp, raw for pdf and other docs) and deliver it correctly.

import streamifier from 'streamifier';
import { cloudinary } from '../../config/cloudinary';
import { logger } from '../../shared/utils/logger';

type CloudinaryResult = {
  fileUrl: string;
  fileKey: string;
  resourceType: string;
  format?: string;
  bytes?: number;
};

/**
 * Sem credenciais de Cloudinary, o envio é simulado em vez de rebentar.
 *
 * POR QUE ISTO EXISTE: o controller das retiradas envia o ficheiro ANTES de
 * validar o valor e o saldo. Num ambiente sem Cloudinary — a integração
 * contínua, ou uma máquina acabada de clonar — esse envio falhava e o pedido
 * respondia 500, escondendo a validação que se queria testar. Um teste que
 * verifica "recusa acima do saldo" recebia 500 em vez de 400 e ninguém
 * percebia porquê.
 *
 * SÓ FORA DE PRODUÇÃO. Em produção, a ausência de credenciais é uma avaria de
 * configuração e tem de rebentar alto — um sistema a fingir que guardou
 * recibos que não guardou é muito pior do que um que se recusa a arrancar.
 *
 * Mesmo padrão do email.service, que já regista em vez de enviar quando não há
 * RESEND_API_KEY.
 */
function cloudinaryConfigurado(): boolean {
  return Boolean(process.env.CLOUD_NAME && process.env.API_KEY && process.env.API_SECRET);
}

export async function uploadToCloudinary(
  buffer: Buffer,
  mimetype: string,
  folder = 'uploads',
): Promise<CloudinaryResult> {
  if (!cloudinaryConfigurado()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[upload] Cloudinary não configurado. Defina CLOUD_NAME, API_KEY e API_SECRET.',
      );
    }
    logger.warn(
      '[upload] Cloudinary não configurado — ficheiro NÃO foi guardado. ' +
      'A referência devolvida é fictícia e serve apenas para o fluxo continuar.',
    );
    const marca = `local/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      fileUrl: `https://exemplo.invalido/${marca}`,
      fileKey: marca,
      resourceType: mimetype.startsWith('image/') ? 'image' : 'raw',
      bytes: buffer.length,
    };
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        // Let Cloudinary pick: images stay images, PDFs/docs become "raw".
        resource_type: 'auto',
        // Keep original filename info for a friendlier public_id/extension.
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          fileUrl: result.secure_url,
          fileKey: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
}

/**
 * Deletes a previously uploaded file. Needs the resource_type that was used to
 * upload it (images and raw files live in different Cloudinary namespaces).
 * Useful when a document is replaced or removed.
 */
export async function deleteFromCloudinary(
  fileKey: string,
  resourceType: 'image' | 'raw' | 'video' = 'image',
): Promise<void> {
  // Sem credenciais não há nada para apagar: as referências fictícias do modo
  // sem Cloudinary não existem em lado nenhum.
  if (!cloudinaryConfigurado()) return;
  await cloudinary.uploader.destroy(fileKey, { resource_type: resourceType });
}
