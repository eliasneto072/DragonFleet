// src/modules/upload/upload.service.ts
//
// FIX: the previous version hardcoded `resource_type: 'image'` for every upload.
// Cloudinary treats PDFs and other documents as `raw`/`auto`, NOT `image`, so
// PDF uploads were being mangled or blocked — which is why uploads felt
// "photo only". Using `resource_type: 'auto'` lets Cloudinary detect the type
// (image for jpg/png/webp, raw for pdf and other docs) and deliver it correctly.

import streamifier from 'streamifier';
import { cloudinary } from '../../config/cloudinary';

type CloudinaryResult = {
  fileUrl: string;
  fileKey: string;
  resourceType: string;
  format?: string;
  bytes?: number;
};

export async function uploadToCloudinary(
  buffer: Buffer,
  mimetype: string,
  folder = 'uploads',
): Promise<CloudinaryResult> {
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
  await cloudinary.uploader.destroy(fileKey, { resource_type: resourceType });
}
