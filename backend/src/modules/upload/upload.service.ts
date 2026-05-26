import streamifier from 'streamifier';
import { cloudinary } from '../../config/cloudinary';

type CloudinaryResult = {
  fileUrl: string;
  fileKey: string;
};

export async function uploadToCloudinary(
  buffer: Buffer,
  mimetype: string,
  folder = 'uploads'
): Promise<CloudinaryResult> {
  return new Promise((resolve, reject) => {
    const isPdf = mimetype === 'application/pdf';

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        ...(isPdf && { format: 'pdf' }),
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          fileUrl: result.secure_url,
          fileKey: result.public_id,
        });
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
}