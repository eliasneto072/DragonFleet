"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserSchema = exports.createUserSchema = exports.userIdParamSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../../shared/types/enums");
exports.userIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
});
exports.createUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(2),
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(6),
        role: zod_1.z.nativeEnum(enums_1.UserRole).optional(),
        status: zod_1.z.nativeEnum(enums_1.UserStatus).optional(),
    }),
});
exports.updateUserSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z
        .object({
        name: zod_1.z.string().min(2).optional(),
        email: zod_1.z.string().email().optional(),
        password: zod_1.z.string().min(6).optional(),
        role: zod_1.z.nativeEnum(enums_1.UserRole).optional(),
        status: zod_1.z.nativeEnum(enums_1.UserStatus).optional(),
    })
        .refine((b) => Object.keys(b).length > 0, {
        message: 'At least one field is required',
    }),
});
