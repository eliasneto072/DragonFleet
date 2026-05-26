"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadController = void 0;
const streamifier_1 = __importDefault(require("streamifier"));
const cloudinary_1 = require("../../config/cloudinary");
class UploadController {
    async upload(req, res) {
        try {
            const file = req.file;
            if (!file) {
                return res.status(400).json({
                    ok: false,
                    message: 'Imagem não enviada'
                });
            }
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary_1.cloudinary.uploader.upload_stream({
                    folder: 'bras-conecta',
                }, (error, result) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(result);
                    }
                });
                streamifier_1.default
                    .createReadStream(file.buffer)
                    .pipe(stream);
            });
            return res.status(200).json({
                ok: true,
                data: result
            });
        }
        catch (err) {
            console.error(err);
            return res.status(500).json({
                ok: false,
                message: 'Erro ao realizar upload'
            });
        }
    }
}
exports.UploadController = UploadController;