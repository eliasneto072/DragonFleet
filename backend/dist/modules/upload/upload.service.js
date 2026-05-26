"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = uploadToCloudinary;
const streamifier_1 = __importDefault(require("streamifier"));
const cloudinary_1 = require("../../config/cloudinary");
async function uploadToCloudinary(buffer, mimetype, folder = 'uploads') {
    return new Promise((resolve, reject) => {
        const isPdf = mimetype === 'application/pdf';
        const stream = cloudinary_1.cloudinary.uploader.upload_stream({
            folder,
            resource_type: 'image',
            ...(isPdf && { format: 'pdf' }),
        }, (error, result) => {
            if (error || !result)
                return reject(error);
            resolve({
                fileUrl: result.secure_url,
                fileKey: result.public_id,
            });
        });
        streamifier_1.default.createReadStream(buffer).pipe(stream);
    });
}
