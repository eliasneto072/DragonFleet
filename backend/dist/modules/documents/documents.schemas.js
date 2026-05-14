"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDocumentStatusSchema = exports.updateDocumentSchema = exports.createDocumentSchema = exports.documentIdParamSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../../shared/types/enums");
exports.documentIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
});
exports.createDocumentSchema = zod_1.z.object({
    body: zod_1.z.object({
        type: zod_1.z.nativeEnum(enums_1.DocumentType),
        fileUrl: zod_1.z.string().min(1),
        fileKey: zod_1.z.string().min(1),
    }),
});
exports.updateDocumentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z
        .object({
        type: zod_1.z.nativeEnum(enums_1.DocumentType).optional(),
        fileUrl: zod_1.z.string().min(1).optional(),
    })
        .refine((body) => Object.keys(body).length > 0, {
        message: 'At least one field is required',
    }),
});
// rota dedicada só pra status (bem profissional)
exports.updateDocumentStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z.object({
        status: zod_1.z.nativeEnum(enums_1.DocumentStatus),
    }),
});
